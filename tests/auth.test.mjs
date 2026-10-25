import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import ts from 'typescript'
import { AxiosError, AxiosHeaders } from 'axios'

// Compile isolated service modules using the project's existing TypeScript dependency.
const directory = await mkdtemp(resolve('node_modules/.auth-tests-'))
async function load(name) {
  const source = await readFile(new URL(`../src/services/${name}.ts`, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  const path = resolve(directory, `${name}.mjs`)
  await writeFile(path, output)
  return import(pathToFileURL(path).href)
}
const { createAuthClient, authErrorMessage } = await load('authClient')
const { validateAuth } = await load('authValidation')
const { createMockAuthAdapter } = await load('mockAuthAdapter')
const { after } = await import('node:test')
after(() => rm(directory, { recursive: true, force: true }))

const user = { id: 'test-user', email: 'test@example.test', username: 'tester', full_name: 'Test User' }
const session = { access_token: 'old-access', refresh_token: 'refresh-one', token_type: 'bearer', user }
const input = { email: user.email, password: 'test-only-password' }
function reply(config, data, status = 200) {
  const response = { config, data, status, statusText: String(status), headers: new AxiosHeaders() }
  if (status >= 400) throw new AxiosError('Test error', 'ERR_BAD_REQUEST', config, undefined, response)
  return response
}

test('validation rejects invalid fields, mismatch, whitespace and accepts Thai names', () => {
  const valid = { ...input, full_name: 'ผู้ทดสอบ', username: 'tester', confirmPassword: input.password }
  assert.deepEqual(validateAuth(valid, true), {})
  assert.equal(Object.keys(validateAuth({ ...valid, email: 'bad', username: '!', password: 'short', confirmPassword: 'different', full_name: '' }, true)).length, 5)
  assert.ok(validateAuth({ ...valid, password: '        ' }, true).password)
  assert.deepEqual(validateAuth({ ...valid, password: 'old' }, false), {})
})

test('concurrent 401s share refresh, rotate tokens, replay with new Bearer', async () => {
  let refreshes = 0
  let retries = 0
  const client = createAuthClient('/api/v1', async (config) => {
    if (config.url === '/auth/login') return reply(config, session)
    if (config.url === '/auth/refresh') {
      refreshes++
      assert.deepEqual(JSON.parse(config.data), { refresh_token: 'refresh-one' })
      await new Promise((resolve) => setTimeout(resolve, 20))
      return reply(config, { access_token: 'new-access', refresh_token: 'refresh-two' })
    }
    if (config.headers.get('Authorization') === 'Bearer new-access') { retries++; return reply(config, { ok: true }) }
    return reply(config, {}, 401)
  })
  await client.login(input)
  await Promise.all([client.api.get('/private'), client.api.get('/private')])
  assert.equal(refreshes, 1)
  assert.equal(retries, 2)
  assert.equal(client.getSession().refresh_token, 'refresh-two')
})

test('refresh failure clears session and never loops', async () => {
  let refreshes = 0
  const client = createAuthClient('/api/v1', async (config) => {
    if (config.url === '/auth/login') return reply(config, session)
    if (config.url === '/auth/refresh') refreshes++
    return reply(config, {}, 401)
  })
  await client.login(input)
  await assert.rejects(client.api.get('/private'))
  assert.equal(refreshes, 1)
  assert.equal(client.getSession(), null)
})

test('access-only refresh retains refresh token; non-401 errors preserve session', async () => {
  let privateCalls = 0
  const client = createAuthClient('/api/v1', async (config) => {
    if (config.url === '/auth/login') return reply(config, session)
    if (config.url === '/auth/refresh') return reply(config, { access_token: 'new-access' })
    if (config.url === '/forbidden') return reply(config, {}, 403)
    privateCalls++
    return reply(config, {}, privateCalls === 1 ? 401 : 200)
  })
  await client.login(input)
  await client.api.get('/private')
  assert.equal(client.getSession().refresh_token, 'refresh-one')
  await assert.rejects(client.api.get('/forbidden'))
  assert.ok(client.getSession())
})

test('logout cancels a pending login response', async () => {
  let finish
  const client = createAuthClient('/api/v1', (config) => new Promise((resolve) => { finish = () => resolve(reply(config, session)) }))
  const login = client.login(input)
  client.logout()
  finish()
  await assert.rejects(login)
  assert.equal(client.getSession(), null)
})

test('second 401 after refresh signs out without another refresh', async () => {
  let refreshes = 0
  const client = createAuthClient('/api/v1', async (config) => {
    if (config.url === '/auth/login') return reply(config, session)
    if (config.url === '/auth/refresh') { refreshes++; return reply(config, { access_token: 'new-access' }) }
    return reply(config, {}, 401)
  })
  await client.login(input)
  await assert.rejects(client.api.get('/private'))
  assert.equal(refreshes, 1)
  assert.equal(client.getSession(), null)
})

test('logout during refresh cannot restore session or replay request', async () => {
  let finish
  let started
  const refreshing = new Promise((resolve) => { started = resolve })
  const client = createAuthClient('/api/v1', async (config) => {
    if (config.url === '/auth/login') return reply(config, session)
    if (config.url === '/auth/refresh') { started(); return new Promise((resolve) => { finish = () => resolve(reply(config, { access_token: 'new-access' })) }) }
    return reply(config, {}, 401)
  })
  await client.login(input)
  const request = client.api.get('/private')
  await refreshing
  client.logout()
  finish()
  await assert.rejects(request)
  assert.equal(client.getSession(), null)
})

test('late 401 from an old account cannot replay as a new account', async () => {
  let finish
  let ready
  const sent = new Promise((resolve) => { ready = resolve })
  const client = createAuthClient('/api/v1', async (config) => {
    if (config.url === '/auth/login') return reply(config, session)
    ready()
    return new Promise((resolve, reject) => { finish = () => { try { resolve(reply(config, {}, 401)) } catch (error) { reject(error) } } })
  })
  await client.login(input)
  const request = client.api.get('/private')
  await sent
  client.logout()
  await client.login(input)
  finish()
  await assert.rejects(request)
  assert.ok(client.getSession())
})

test('mock register/login, duplicate and incorrect password errors, fresh instance reset', async () => {
  const client = createAuthClient('/api/v1', createMockAuthAdapter())
  await client.register({ ...input, ...user })
  assert.equal(client.getSession(), null)
  await assert.rejects(client.register({ ...input, ...user }), (error) => authErrorMessage(error).includes('already registered'))
  await assert.rejects(client.login({ ...input, password: 'wrong-test-password' }), (error) => authErrorMessage(error).includes('incorrect'))
  await client.login(input)
  assert.equal(client.getSession().user.email, input.email)
  assert.match(client.getSession().access_token, /^mock-only-/)
  const fresh = createAuthClient('/api/v1', createMockAuthAdapter())
  await assert.rejects(fresh.login(input))
})

test('login 401 never refreshes and network errors have usable messages', async () => {
  const client = createAuthClient('/api/v1', async (config) => { assert.equal(config.url, '/auth/login'); return reply(config, {}, 401) })
  await assert.rejects(client.login(input))
  assert.equal(client.getSession(), null)
  assert.match(authErrorMessage(new AxiosError('network')), /Unable to reach/)
})
