import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import ts from 'typescript'

const directory = await mkdtemp(resolve('node_modules/.websocket-tests-'))
for (const name of ['chatConnection', 'webSocketAdapter', 'mockWebSocketAdapter', 'mockMessageData', 'authClient']) {
  const source = await readFile(new URL(`../src/services/${name}.ts`, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/from '(\.\/[^']+)'/g, "from '$1.mjs'")
  await writeFile(resolve(directory, `${name}.mjs`), output)
}
const load = (name) => import(pathToFileURL(resolve(directory, `${name}.mjs`)).href)
const { ChatConnection } = await load('chatConnection')
const { webSocketUrl, createWebSocketAdapter, decodeLiveEvent } = await load('webSocketAdapter')
const { createMockWebSocketAdapter, decodeMockEvent } = await load('mockWebSocketAdapter')
const { createAuthClient } = await load('authClient')
after(() => rm(directory, { recursive: true, force: true }))

const session = { access_token: 'test-access', refresh_token: 'test-refresh', token_type: 'bearer', user: { id: 'u1', full_name: 'One', username: 'one' } }
const channel = (id, workspace_id = 'w1') => ({ id, workspace_id, name: id, is_private: false })
const scope = { session, workspaceId: 'w1', channels: [channel('c1'), channel('c2')] }
const message = (id = 'm1', channel_id = 'c1') => ({ type: 'new_message', workspaceId: 'w1', message: { id, channel_id, user_id: 'u2', content: 'สวัสดี', created_at: new Date().toISOString(), author: { id: 'u2', full_name: 'Two' } } })
const typing = { type: 'user_typing', workspaceId: 'w1', channelId: 'c1', userId: 'u2', name: 'Two' }

function setup(t, options = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 100000 })
  const sockets = []
  const connection = new ChatConnection((auth, workspaceId, handlers) => {
    const socket = { auth, workspaceId, handlers, frames: [], closed: false, send(frame) { this.frames.push(frame) }, close() { this.closed = true } }
    sockets.push(socket)
    return socket
  }, { retryMs: 1000, random: () => 0, ...options })
  t.after(() => connection.dispose())
  connection.setScope(scope)
  return { connection, sockets, open: () => sockets.at(-1).handlers.open() }
}

test('one workspace connection multiplexes channels; repeated scope/channel selection does not reconnect', (t) => {
  const { connection, sockets, open } = setup(t)
  assert.equal(connection.getSnapshot().state, 'connecting')
  open()
  assert.equal(connection.getSnapshot().state, 'connected')
  assert.deepEqual(sockets[0].frames, [{ action: 'subscribe', channel_id: 'c1' }, { action: 'subscribe', channel_id: 'c2' }])
  connection.setScope({ ...scope, channels: [...scope.channels, channel('c3')] })
  connection.setScope({ ...scope, channels: [...scope.channels, channel('c3')] })
  assert.equal(sockets.length, 1)
  assert.equal(sockets[0].frames.length, 3)
  sockets[0].handlers.event(message('background', 'c2'))
  assert.equal(connection.getSnapshot().messages.c2[0].id, 'background')
  assert.equal(connection.sendMessage('w1', 'c3', ' hi '), true)
  assert.deepEqual(sockets[0].frames.at(-1), { action: 'send_message', channel_id: 'c3', content: 'hi' })
})

test('send/receive guard workspace and channel; echoes deduplicate by server ID without optimistic copies', (t) => {
  const { connection, sockets, open } = setup(t)
  assert.equal(connection.sendMessage('w1', 'c1', 'offline'), false)
  open()
  assert.equal(connection.sendMessage('w2', 'c1', 'wrong workspace'), false)
  assert.equal(connection.sendMessage('w1', 'unknown', 'wrong channel'), false)
  assert.equal(connection.sendMessage('w1', 'c1', '   '), false)
  assert.equal(connection.sendMessage('w1', 'c1', 'hello'), true)
  assert.deepEqual(connection.getSnapshot().messages, {})
  sockets[0].handlers.event(message())
  sockets[0].handlers.event(message())
  sockets[0].handlers.event({ ...message('wrong'), workspaceId: 'w2' })
  sockets[0].handlers.event(message('unknown', 'unknown'))
  assert.equal(connection.getSnapshot().messages.c1.length, 1)
})

test('typing is throttled, ignores self, expires per user and clears when a message arrives', (t) => {
  const { connection, sockets, open } = setup(t)
  open()
  connection.sendTyping('w1', 'c1')
  connection.sendTyping('w1', 'c1')
  connection.sendTyping('w2', 'c1')
  assert.equal(sockets[0].frames.filter((f) => f.action === 'typing').length, 1)
  sockets[0].handlers.event({ ...typing, userId: 'u1' })
  assert.deepEqual(connection.getSnapshot().typing, {})
  sockets[0].handlers.event(typing)
  t.mock.timers.tick(2000)
  sockets[0].handlers.event({ ...typing, userId: 'u3', name: 'Three' })
  t.mock.timers.tick(1000)
  assert.deepEqual(connection.getSnapshot().typing.c1, { u3: 'Three' })
  sockets[0].handlers.event(typing)
  sockets[0].handlers.event(message())
  assert.deepEqual(connection.getSnapshot().typing.c1, { u3: 'Three' })
  t.mock.timers.tick(3000)
  assert.deepEqual(connection.getSnapshot().typing.c1, {})
})

test('unexpected disconnect reconnects once, resubscribes and never replays messages', (t) => {
  const { connection, sockets, open } = setup(t)
  open()
  sockets[0].handlers.event(message())
  connection.sendMessage('w1', 'c1', 'hello')
  sockets[0].handlers.close(1006)
  sockets[0].handlers.close(1006)
  assert.equal(connection.getSnapshot().state, 'disconnected')
  assert.equal(connection.sendMessage('w1', 'c1', 'offline'), false)
  t.mock.timers.tick(1000)
  assert.equal(sockets.length, 2)
  open()
  assert.deepEqual(sockets[1].frames.map((f) => f.action), ['subscribe', 'subscribe'])
  sockets[1].handlers.event(message())
  assert.equal(connection.getSnapshot().messages.c1.length, 1)
})

test('opening timeout and exponential backoff; cleanup cancels pending reconnect', (t) => {
  const { connection, sockets } = setup(t)
  t.mock.timers.tick(10000)
  assert.equal(connection.getSnapshot().state, 'disconnected')
  t.mock.timers.tick(1000)
  assert.equal(sockets.length, 2)
  sockets[1].handlers.close(1006)
  t.mock.timers.tick(1999)
  assert.equal(sockets.length, 2)
  connection.dispose()
  t.mock.timers.tick(60000)
  assert.equal(sockets.length, 2)
  assert.equal(sockets[1].closed, true)
})

test('workspace switches reject old callbacks, retain separate histories and cannot send through stale selection', (t) => {
  const { connection, sockets, open } = setup(t)
  open()
  sockets[0].handlers.event(message())
  connection.setScope({ session, workspaceId: 'w2', channels: [channel('c1', 'w2')] })
  open()
  assert.deepEqual(connection.getSnapshot().messages, {})
  sockets[0].handlers.event(message('late'))
  sockets[0].handlers.close(1006)
  assert.equal(connection.sendMessage('w1', 'c1', 'stale'), false)
  assert.deepEqual(connection.getSnapshot().messages, {})
  sockets[1].handlers.event({ ...message('w2-message'), workspaceId: 'w2' })
  connection.setScope(scope)
  open()
  assert.equal(connection.getSnapshot().messages.c1[0].id, 'm1')
  assert.equal(sockets.length, 3)
})

test('token rotation replaces the socket; logout clears messages, timers and stale events', (t) => {
  const { connection, sockets, open } = setup(t)
  open()
  sockets[0].handlers.event(message())
  connection.setScope({ ...scope, session: { ...session, access_token: 'rotated' } })
  assert.equal(sockets[0].closed, true)
  assert.equal(sockets[1].auth.access_token, 'rotated')
  open()
  assert.equal(connection.getSnapshot().messages.c1.length, 1)
  connection.setScope(null)
  sockets[1].handlers.open()
  sockets[1].handlers.event(message('late'))
  sockets[1].handlers.close(1006)
  t.mock.timers.tick(60000)
  assert.deepEqual(connection.getSnapshot().messages, {})
  assert.equal(connection.getSnapshot().state, 'disconnected')
  assert.equal(sockets.length, 2)
})

test('removing channel access reconnects without inventing unsubscribe; heartbeat stops on disposal', (t) => {
  const { connection, sockets, open } = setup(t)
  open()
  t.mock.timers.tick(25000)
  assert.equal(sockets[0].frames.at(-1).action, 'heartbeat')
  connection.setScope({ ...scope, channels: [channel('c1')] })
  open()
  assert.deepEqual(sockets[1].frames, [{ action: 'subscribe', channel_id: 'c1' }])
  assert.equal(connection.sendMessage('w1', 'c2', 'removed'), false)
  connection.dispose()
  t.mock.timers.tick(60000)
  assert.equal(sockets[1].frames.length, 1)
})

test('send failures return false and preserve the composer contract', (t) => {
  const { connection, sockets, open } = setup(t)
  open()
  sockets[0].send = () => { throw new Error('socket closed') }
  assert.equal(connection.sendMessage('w1', 'c1', 'keep draft'), false)
  assert.match(connection.getSnapshot().error, /not sent/)
})

test('removing a deleted channel purges its messages and rejects late history', (t) => {
  const { connection, sockets, open } = setup(t)
  open()
  sockets[0].handlers.event(message('keep', 'c1'))
  sockets[0].handlers.event(message('deleted', 'c2'))
  connection.setScope({ ...scope, channels: [channel('c1')] })
  open()
  assert.equal(connection.getSnapshot().messages.c2, undefined)
  connection.mergeHistory('w1', 'c2', [message('late', 'c2').message])
  assert.equal(connection.getSnapshot().messages.c2, undefined)
  assert.equal(connection.getSnapshot().messages.c1[0].id, 'keep')
})

test('history merges with new live messages and cannot cross workspace scope', (t) => {
  const { connection, sockets, open } = setup(t)
  open()
  sockets[0].handlers.event(message('live'))
  connection.mergeHistory('w1', 'c1', [message('older').message, message('live').message, message('wrong', 'c2').message])
  assert.deepEqual(connection.getSnapshot().messages.c1.map((item) => item.id), ['live', 'older'])
  connection.setScope({ session, workspaceId: 'w2', channels: [channel('c1', 'w2')] })
  connection.mergeHistory('w1', 'c1', [message('old-workspace').message])
  assert.deepEqual(connection.getSnapshot().messages, {})
})

test('backend rejection of a stale deleted-room send is visible as an error', (t) => {
  const { connection, sockets, open } = setup(t)
  open()
  const event = decodeLiveEvent(JSON.stringify({ type: 'error', message: 'Channel unavailable. Message was not sent.' }), 'w1')
  sockets[0].handlers.event(event)
  assert.match(connection.getSnapshot().error, /not sent/)
})

test('auth-expiration classification is injected, refresh reuses Auth client and new token', async (t) => {
  let refreshes = 0
  const client = createAuthClient('/api/v1', async (config) => {
    if (config.url === '/auth/refresh') refreshes++
    return { config, data: config.url === '/auth/login' ? session : { access_token: 'fresh' }, status: 200, headers: {}, statusText: 'OK' }
  })
  await client.login({ email: 'test@example.test', password: 'test' })
  // 4999 is a test fixture, deliberately NOT declared as a Backend close code.
  const { connection, sockets, open } = setup(t, { refresh: client.refresh, isAuthClose: (code) => code === 4999 })
  const unsubscribe = client.subscribe((next) => connection.setScope(next ? { ...scope, session: next } : null))
  t.after(unsubscribe)
  open()
  sockets[0].handlers.close(4999)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(refreshes, 1)
  assert.equal(sockets.at(-1).auth.access_token, 'fresh')
  assert.equal(sockets.length, 2)
})

test('strict-mode style setup/cleanup/setup leaves only the replacement connection alive', (t) => {
  const { connection, sockets, open } = setup(t)
  connection.dispose()
  connection.setScope(scope)
  open()
  sockets[0].handlers.open()
  sockets[0].handlers.close(1006)
  t.mock.timers.tick(1000)
  assert.equal(sockets.length, 2)
  assert.equal(sockets[0].closed, true)
  assert.equal(connection.getSnapshot().state, 'connected')
})

test('endpoint URL follows token query contract, upgrades WSS and rejects mixed content/mock tokens', () => {
  const url = new URL(webSocketUrl('/ws', 'test a&b', 'https://chat.example.test/'))
  assert.equal(url.protocol, 'wss:')
  assert.equal(url.searchParams.get('token'), 'test a&b')
  assert.equal(new URL(webSocketUrl('ws://localhost:8000/ws', 'test', 'http://localhost/')).port, '8000')
  assert.throws(() => webSocketUrl('ws://chat.example.test/ws', 'test', 'https://chat.example.test/'))
  assert.throws(() => webSocketUrl('/ws', 'mock-only-test', 'http://localhost/'))
  assert.throws(() => webSocketUrl('/other', 'test', 'http://localhost/'))
})

test('native adapter uses confirmed outbound frames and a supplied inbound decoder; cleanup detaches handlers', () => {
  const native = { readyState: 1, bufferedAmount: 0, sent: [], closeCount: 0, send(data) { this.sent.push(JSON.parse(data)) }, close() { this.closeCount++ } }
  const events = []
  let opened = false
  const factory = createWebSocketAdapter({ endpoint: '/ws', pageUrl: 'http://localhost/', createSocket: () => native, decode: (data) => data === 'fixture' ? message() : null })
  const socket = factory(session, 'w1', { open: () => { opened = true }, event: (event) => events.push(event), close() {} })
  native.onopen()
  native.onmessage({ data: 'bad json' })
  native.onmessage({ data: 'fixture' })
  socket.send({ action: 'send_message', channel_id: 'c1', content: 'hello' })
  assert.equal(opened, true)
  assert.equal(events.length, 1)
  assert.deepEqual(native.sent[0], { action: 'send_message', channel_id: 'c1', content: 'hello' })
  native.bufferedAmount = 100000
  assert.throws(() => socket.send({ action: 'heartbeat' }))
  socket.close()
  assert.equal(native.onmessage, null)
  assert.equal(native.onclose, null)
  assert.equal(native.closeCount, 1)
})

test('mock adapter echoes through subscriptions, simulates remote typing/message and disconnects', async (t) => {
  const adapter = createMockWebSocketAdapter()
  const connection = new ChatConnection(adapter.factory)
  t.after(() => connection.dispose())
  connection.setScope(scope)
  await new Promise((resolve) => setTimeout(resolve, 150))
  assert.equal(connection.getSnapshot().state, 'connected')
  assert.equal(connection.sendMessage('w1', 'c1', 'hello'), true)
  adapter.peer('c1', true)
  assert.deepEqual(connection.getSnapshot().typing.c1, { 'mock-peer': 'Mock teammate' })
  adapter.peer('c1', false)
  assert.equal(connection.getSnapshot().messages.c1.length, 2)
  assert.deepEqual(connection.getSnapshot().typing.c1, {})
  adapter.disconnect()
  assert.equal(connection.getSnapshot().state, 'disconnected')
})

test('mock decoder rejects malformed input without defining a real Backend envelope', () => {
  for (const value of [null, 'json', {}, { ...typing, userId: 5 }, { ...message(), message: { ...message().message, author: null } }, { ...message(), message: { ...message().message, created_at: 'invalid' } }]) assert.equal(decodeMockEvent(value), null)
  const fixture = message()
  assert.deepEqual(decodeMockEvent(fixture), fixture)
})

test('two mock clients exchange messages/typing and isolate a third workspace', async (t) => {
  const adapter = createMockWebSocketAdapter()
  const one = new ChatConnection(adapter.factory)
  const two = new ChatConnection(adapter.factory)
  const other = new ChatConnection(adapter.factory)
  t.after(() => { one.dispose(); two.dispose(); other.dispose() })
  one.setScope(scope)
  two.setScope({ ...scope, session: { ...session, user: { ...session.user, id: 'u2', full_name: 'Two' } } })
  other.setScope({ ...scope, workspaceId: 'w2', channels: [channel('c1', 'w2')] })
  await new Promise((resolve) => setTimeout(resolve, 150))
  const delivered = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Mock broadcast did not arrive')), 2000)
    const unsubscribe = two.subscribe(() => {
      if (two.getSnapshot().messages.c1?.length) { clearTimeout(timeout); unsubscribe(); resolve() }
    })
    t.after(() => { clearTimeout(timeout); unsubscribe() })
  })
  one.sendMessage('w1', 'c1', 'cross-client message')
  await delivered
  assert.equal(two.getSnapshot().messages.c1[0].content, 'cross-client message')
  assert.deepEqual(other.getSnapshot().messages, {})
  const typingReceived = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Mock typing did not arrive')), 2000)
    const unsubscribe = two.subscribe(() => {
      if (two.getSnapshot().typing.c1?.u1) { clearTimeout(timeout); unsubscribe(); resolve() }
    })
    t.after(() => { clearTimeout(timeout); unsubscribe() })
  })
  one.sendTyping('w1', 'c1')
  await typingReceived
  assert.equal(two.getSnapshot().typing.c1.u1, 'One')
  assert.deepEqual(other.getSnapshot().typing, {})
})

test('failed auth refresh stops reconnect and cannot restore a disposed session', async (t) => {
  const { connection, sockets, open } = setup(t, { refresh: () => Promise.reject(new Error('expired refresh')), isAuthClose: (code) => code === 4999 })
  open()
  sockets[0].handlers.close(4999)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(connection.getSnapshot().error, 'Please sign in again.')
  t.mock.timers.tick(60000)
  assert.equal(sockets.length, 1)
  connection.dispose()
  assert.deepEqual(connection.getSnapshot().messages, {})
})
