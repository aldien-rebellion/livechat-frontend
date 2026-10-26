import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import ts from 'typescript'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost' })
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Event', 'KeyboardEvent', 'MouseEvent']) globalThis[key] = dom.window[key]
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { createElement, act } = await import('react')
const { createRoot } = await import('react-dom/client')
const directory = await mkdtemp(resolve('node_modules/.channel-tests-'))
for (const [name, sourcePath] of [
  ['channelService', 'services/channelService.ts'],
  ['mockWorkspaceData', 'services/mockWorkspaceData.ts'],
  ['useWorkspaceChannels', 'hooks/useWorkspaceChannels.ts'],
  ['ChannelList', 'components/ChannelList.tsx'],
]) {
  const source = await readFile(new URL(`../src/${sourcePath}`, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText.replace(/from '\.\.\/services\/([^']+)'/g, "from './$1.mjs'")
  await writeFile(resolve(directory, `${name}.mjs`), output)
}
await writeFile(resolve(directory, 'authService.mjs'), `export const authService = { api: {
  get: (...args) => globalThis.channelTestApi.get(...args),
  post: (...args) => globalThis.channelTestApi.post(...args),
  delete: (...args) => globalThis.channelTestApi.delete(...args),
} }`)
const load = (name) => import(pathToFileURL(resolve(directory, `${name}.mjs`)).href)
const { createChannelService, mergeChannels } = await load('channelService')
const { useWorkspaceChannels } = await load('useWorkspaceChannels')
const { default: ChannelList } = await load('ChannelList')
after(async () => { dom.window.close(); await rm(directory, { recursive: true, force: true }) })

const room = (id, workspace_id = 'team', name = 'project-updates') => ({ id, workspace_id, name, is_private: false })
const session = { access_token: 'test-access', user: { id: '12' } }
const deferred = () => {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function sharedServer() {
  const records = []
  const calls = []
  return {
    calls,
    async get(path, options) {
      calls.push({ path, options })
      const workspaceId = decodeURIComponent(path.split('/')[2])
      return { data: structuredClone(records.filter((item) => item.workspace_id === workspaceId)) }
    },
    async post(path, payload) {
      calls.push({ path, payload })
      const workspaceId = decodeURIComponent(path.split('/')[2])
      const created = room(String(records.length + 100), workspaceId, payload.name)
      records.push(created)
      return { data: structuredClone(created) }
    },
  }
}

test('independent clients and a reloaded client discover the same server channel ID', async () => {
  const api = sharedServer()
  const creator = createChannelService(api)
  const friend = createChannelService(api)
  const signal = new AbortController().signal
  assert.deepEqual(await friend.list('team', signal), [])
  const created = await creator.create('team', 'project-updates')
  assert.equal(created.id, '100')
  assert.deepEqual(api.calls.at(-1).payload, { name: 'project-updates' })
  assert.deepEqual(await friend.list('team', signal), [created])
  assert.deepEqual(await createChannelService(api).list('team', signal), [created])
  assert.deepEqual(await friend.list('design', signal), [])
  assert.equal(api.calls.at(-1).options.signal, signal)
})

test('malformed or cross-workspace server responses never become visible channels', async () => {
  const signal = new AbortController().signal
  for (const data of [{}, [room('1', 'design')], [{ ...room('1'), id: 1 }], [{ ...room('1'), is_private: undefined }]]) {
    const service = createChannelService({ get: async () => ({ data }) })
    await assert.rejects(service.list('team', signal), /Invalid channel/)
  }
  const failure = new Error('Server unavailable')
  const service = createChannelService({ post: async () => { throw failure } })
  await assert.rejects(service.create('team', 'new-room'), (error) => error === failure)
})

test('server polling keeps legacy references and does not duplicate rooms or mix workspaces', () => {
  const current = [room('general', 'team', 'general')]
  assert.equal(mergeChannels(current, [room('20', 'team', 'GENERAL')]), current)
  const added = mergeChannels(current, [room('21'), room('22', 'design')])
  assert.deepEqual(added.map((item) => [item.id, item.workspace_id]), [['general', 'team'], ['21', 'team'], ['22', 'design']])
  assert.equal(mergeChannels(added, [room('21'), room('22', 'design')]), added)
})

test('legacy planning and reviews rooms retain their slug IDs without duplicate numeric rooms', () => {
  const current = [room('planning', 'team', 'team-planning'), room('reviews', 'design', 'design-reviews')]
  const incoming = [room('17', 'team', 'planning'), room('18', 'design', 'reviews')]
  assert.equal(mergeChannels(current, incoming), current)
  assert.deepEqual(mergeChannels(current, incoming).map((item) => [item.id, item.name]), [
    ['planning', 'team-planning'], ['reviews', 'design-reviews'],
  ])
})

async function hookSetup(t, api, props = { session, workspaceId: 'team', mock: false }) {
  globalThis.channelTestApi = api
  const intervals = new Map()
  const originalSet = window.setInterval
  const originalClear = window.clearInterval
  let timerId = 0
  window.setInterval = (callback, delay) => { assert.equal(delay, 3000); intervals.set(++timerId, callback); return timerId }
  window.clearInterval = (id) => intervals.delete(id)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  let snapshot
  function Harness(next) { snapshot = useWorkspaceChannels(next.session, next.workspaceId, next.mock); return null }
  const render = async (next) => act(async () => root.render(createElement(Harness, next)))
  await render(props)
  t.after(async () => {
    await act(async () => root.unmount())
    assert.equal(intervals.size, 0, 'poll timers are cleared on unmount')
    container.remove()
    window.setInterval = originalSet
    window.clearInterval = originalClear
    delete globalThis.channelTestApi
  })
  return { read: () => snapshot, render, intervals, tick: () => act(async () => { for (const callback of intervals.values()) callback() }) }
}

test('an already open browser discovers a friend-created channel on its next poll', async (t) => {
  const api = sharedServer()
  const browser = await hookSetup(t, api)
  assert.equal(browser.read().channels.some((item) => item.name === 'new-room'), false)
  const created = await createChannelService(api).create('team', 'new-room')
  await browser.tick()
  assert.deepEqual(browser.read().channels.find((item) => item.name === 'new-room'), created)
  await browser.tick()
  assert.equal(browser.read().channels.filter((item) => item.id === created.id).length, 1)
})

test('channel refresh does not overlap; focus retries failures and clears the error', async (t) => {
  const pending = deferred()
  let calls = 0
  const api = { get: () => { calls++; return calls === 1 ? pending.promise : Promise.resolve({ data: [room('44')] }) } }
  const browser = await hookSetup(t, api)
  await browser.tick()
  await act(async () => window.dispatchEvent(new Event('focus')))
  assert.equal(calls, 1)
  await act(async () => pending.reject(new Error('offline')))
  assert.match(browser.read().syncError, /Unable to refresh/)
  await act(async () => window.dispatchEvent(new Event('focus')))
  assert.equal(calls, 2)
  assert.equal(browser.read().syncError, '')
  assert.ok(browser.read().channels.some((item) => item.id === '44'))
})

test('switching workspace aborts the old request and ignores a late response', async (t) => {
  const pending = deferred()
  let oldSignal
  const api = { get: (path, options) => {
    if (path.includes('/team/')) { oldSignal = options.signal; return pending.promise }
    return Promise.resolve({ data: [room('55', 'design', 'design-room')] })
  } }
  const browser = await hookSetup(t, api)
  await browser.render({ session, workspaceId: 'design', mock: false })
  assert.equal(oldSignal.aborted, true)
  assert.equal(browser.intervals.size, 1)
  await act(async () => pending.resolve({ data: [room('late')] }))
  assert.equal(browser.read().channels.some((item) => item.id === 'late'), false)
  assert.ok(browser.read().channels.some((item) => item.id === '55'))
})

async function channelListSetup(t, onCreateChannel) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(createElement(ChannelList, { channels: [], selectedChannelId: null, onSelectChannel() {}, onCreateChannel })))
  t.after(async () => { await act(async () => root.unmount()); container.remove() })
  await act(async () => container.querySelector('button').click())
  const input = container.querySelector('input')
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'new-room')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const submit = () => act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  return { container, input, submit }
}

test('creation waits for the server, keeps the name after failure, and closes only on success', async (t) => {
  const first = deferred()
  let calls = 0
  const form = await channelListSetup(t, (name) => { assert.equal(name, 'new-room'); calls++; return calls === 1 ? first.promise : Promise.resolve() })
  await form.submit()
  assert.equal(form.container.querySelector('[type="submit"]').disabled, true)
  assert.match(form.container.textContent, /Creating…/)
  await form.submit()
  assert.equal(calls, 1)
  await act(async () => first.reject(new Error('offline')))
  assert.equal(form.input.value, 'new-room')
  assert.match(form.container.querySelector('[role="alert"]').textContent, /Unable to create/)
  await form.submit()
  assert.equal(calls, 2)
  assert.equal(form.container.querySelector('form'), null)
})

test('server duplicate errors remain visible in the channel creation form', async (t) => {
  const form = await channelListSetup(t, () => Promise.reject({ isAxiosError: true, response: { status: 409 } }))
  await form.submit()
  assert.match(form.container.querySelector('[role="alert"]').textContent, /already exists/)
  assert.equal(form.input.value, 'new-room')
})
