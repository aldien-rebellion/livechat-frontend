import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import ts from 'typescript'
import axios from 'axios'

const directory = await mkdtemp(resolve('node_modules/.search-tests-'))
for (const name of ['searchService', 'mockSearchService']) {
  const source = await readFile(new URL(`../src/services/${name}.ts`, import.meta.url), 'utf8')
  await writeFile(resolve(directory, `${name}.mjs`), ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText)
}
const { createApiSearchService } = await import(pathToFileURL(resolve(directory, 'searchService.mjs')).href)
const { createMockSearchService } = await import(pathToFileURL(resolve(directory, 'mockSearchService.mjs')).href)
after(() => rm(directory, { recursive: true, force: true }))

const channel = { id: 'c1', workspace_id: 'w1', name: 'general', is_private: false }
const request = (query = 'hello', overrides = {}) => ({ workspaceId: 'w1', channel, query, signal: new AbortController().signal, ...overrides })
const message = (id, content = 'Hello team', channel_id = 'c1') => ({
  id: String(id), content, channel_id, user_id: 'u1', author: { id: 'u1', full_name: 'Tester' },
  created_at: new Date(Date.UTC(2026, 9, 23, 0, id)).toISOString(),
})

test('mock matches trimmed, case-insensitive literal text and Thai; scopes channel and workspace', async () => {
  const service = createMockSearchService(() => [message(1), message(2, 'สวัสดีทีม'), message(3, 'Hello other channel', 'c2')], 0)
  assert.deepEqual((await service.search(request(' HELLO '))).map((m) => m.id), ['1'])
  assert.deepEqual((await service.search(request('สวัสดี'))).map((m) => m.id), ['2'])
  await assert.rejects(service.search(request('hello', { workspaceId: 'w2' })), /scope/)
})

test('mock returns empty for whitespace/missing query, newest first, with a limit of 30', async () => {
  const service = createMockSearchService(() => Array.from({ length: 40 }, (_, i) => message(i)), 0)
  assert.deepEqual(await service.search(request('   ')), [])
  assert.deepEqual(await service.search(request('missing')), [])
  const results = await service.search(request())
  assert.equal(results.length, 30)
  assert.equal(results[0].id, '39')
  assert.equal(results.at(-1).id, '10')
})

test('mock reads current history, including newly sent/received messages; treats special characters literally', async () => {
  const history = []
  const service = createMockSearchService(() => history, 0)
  assert.deepEqual(await service.search(request()), [])
  history.push(message(1, '<script>hello [.*]</script>'))
  assert.equal((await service.search(request('[.*]')))[0].content, history[0].content)
})

test('mock aborts before and during work without returning stale results', async () => {
  const service = createMockSearchService(() => [message(1)], 100)
  const controller = new AbortController()
  const pending = service.search(request('hello', { signal: controller.signal }))
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  await assert.rejects(service.search(request('hello', { signal: controller.signal })), { name: 'AbortError' })
})

function apiService(data = [message(1)], status = 200) {
  const calls = []
  const api = axios.create({ baseURL: '/api/v1', adapter: async (config) => {
    calls.push(config)
    if (status !== 200) throw new Error('Network failed')
    return { config, data, status, headers: {}, statusText: 'OK' }
  } })
  const service = createApiSearchService(api, (response) => {
    if (!Array.isArray(response)) throw new Error('Invalid response')
    return response
  })
  return { service, calls }
}

test('API adapter uses planned GET path/query, existing Axios client and cancellation signal', async () => {
  const { service, calls } = apiService()
  const input = request(' hello & สวัสดี ')
  assert.equal((await service.search(input))[0].id, '1')
  assert.equal(calls[0].method, 'get')
  assert.equal(calls[0].baseURL, '/api/v1')
  assert.equal(calls[0].url, '/channels/c1/search')
  assert.deepEqual(calls[0].params, { q: 'hello & สวัสดี' })
  assert.equal(calls[0].signal, input.signal)
})

test('API adapter guards scope/blank/aborted requests before making any network call', async () => {
  const { service, calls } = apiService()
  assert.deepEqual(await service.search(request(' ')), [])
  await assert.rejects(service.search(request('hello', { workspaceId: 'other' })))
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(service.search(request('hello', { signal: controller.signal })))
  assert.equal(calls.length, 0)
})

test('API adapter encodes channel IDs; rejects other-channel results and decoder/network errors', async () => {
  const encoded = apiService([])
  await encoded.service.search(request('hello', { channel: { ...channel, id: 'a/b ?' } }))
  assert.equal(encoded.calls[0].url, '/channels/a%2Fb%20%3F/search')
  await assert.rejects(apiService([message(1, 'Hello', 'c2')]).service.search(request()), /outside/)
  await assert.rejects(apiService({ unknown: [] }).service.search(request()), /Invalid response/)
  await assert.rejects(apiService([], 500).service.search(request()), /Network failed/)
})

test('API adapter preserves backend relevance order and caps decoded results at 30', async () => {
  const { service } = apiService(Array.from({ length: 40 }, (_, i) => message(i)))
  const results = await service.search(request())
  assert.equal(results.length, 30)
  assert.equal(results[0].id, '0')
  assert.equal(results.at(-1).id, '29')
})
