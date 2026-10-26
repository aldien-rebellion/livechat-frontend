import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { AxiosError } from 'axios'
import ts from 'typescript'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost' })
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Event', 'KeyboardEvent']) globalThis[key] = dom.window[key]
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
dom.window.HTMLElement.prototype.scrollIntoView = function () { this.dataset.scrolled = 'true' }
const { createElement, act } = await import('react')
const { createRoot } = await import('react-dom/client')
const directory = await mkdtemp(resolve('node_modules/.live-search-tests-'))
for (const [folder, names] of [
  ['components', ['LiveChat', 'ChatArea', 'SearchMessages', 'SearchModal', 'MessageItem', 'MessageInput']],
  ['services', ['authClient', 'searchService', 'mockSearchService', 'chatConnection']],
]) {
  for (const name of names) {
    const source = await readFile(new URL(`../src/${folder}/${name}.${folder === 'components' ? 'tsx' : 'ts'}`, import.meta.url), 'utf8')
    await writeFile(resolve(directory, `${name}.mjs`), ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText.replace(/from '(\.\.?\/[^']+)'/g, (_, path) => `from './${path.split('/').at(-1)}.mjs'`))
  }
}
await writeFile(resolve(directory, 'authService.mjs'), `import {createAuthClient} from './authClient.mjs'; export const authService = createAuthClient('/api/v1', config => globalThis.liveSearchTransport(config), null)`)
await writeFile(resolve(directory, 'useAuth.mjs'), `import {authService} from './authService.mjs'; export const useAuth = () => ({session:authService.getSession()})`)
await writeFile(resolve(directory, 'useWebSocket.mjs'), `import {useSyncExternalStore} from 'react'; export function useWebSocket() { const connection=globalThis.liveSearchConnection; return {...useSyncExternalStore(connection.subscribe,connection.getSnapshot),connection,mock:false} }`)
const load = (name) => import(pathToFileURL(resolve(directory, `${name}.mjs`)).href)
const { authService } = await load('authService')
const { ChatConnection } = await load('chatConnection')
const { default: LiveChat } = await load('LiveChat')
after(async () => { dom.window.close(); await rm(directory, { recursive: true, force: true }) })

const channel = { id: '7', workspace_id: 'team', name: 'general', is_private: false }
const user = { id: '3', username: 'Tester', full_name: 'Tester' }
const session = { access_token: 'old-access', refresh_token: 'refresh-test', token_type: 'bearer', user }
const oldMessage = { id: '1', channel_id: '7', user_id: '4', content: 'สวัสดีทีม ข้อความเก่า', created_at: '2026-10-01T01:00:00Z', author: { id: '4', full_name: 'Teammate' } }
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const reply = (config, data) => ({ config, data, status: 200, headers: {}, statusText: 'OK' })

async function setup(t, searchHandler) {
  const calls = []
  globalThis.liveSearchTransport = async (config) => {
    calls.push(config)
    if (config.url === '/auth/login') return reply(config, session)
    if (config.url === '/auth/refresh') return reply(config, { access_token: 'fresh-access' })
    return searchHandler(config)
  }
  await authService.login({ email: 'tester@example.test', password: 'fixture-only' })
  let handlers
  const connection = new ChatConnection((_auth, _workspace, next) => {
    handlers = next
    return { send() {}, close() {} }
  })
  connection.setScope({ session, workspaceId: 'team', channels: [channel] })
  handlers.open()
  handlers.event({ type: 'new_message', workspaceId: 'team', message: { ...oldMessage, id: '99', content: 'Latest message', created_at: '2026-10-26T01:00:00Z' } })
  globalThis.liveSearchConnection = connection
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(createElement(LiveChat, { channel })))
  t.after(async () => {
    await act(async () => root.unmount())
    connection.dispose()
    container.remove()
    delete globalThis.liveSearchConnection
    delete globalThis.liveSearchTransport
  })
  await act(async () => container.querySelector('button[aria-haspopup="dialog"]').click())
  const input = container.querySelector('input[type="search"]')
  const search = async (value) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => pause(300))
  }
  return { container, input, calls, search, connection }
}

test('live search is enabled, uses authenticated API, and jumps to an older unloaded message', async (t) => {
  const ui = await setup(t, async (config) => reply(config, [oldMessage]))
  assert.equal(ui.input.disabled, false)
  assert.match(ui.container.textContent, /Search saved messages/)
  assert.doesNotMatch(ui.container.textContent, /integration pending|Demo search/)
  assert.equal(ui.container.querySelector('[data-message-id="1"]'), null)
  await ui.search('วัสดี')
  const call = ui.calls.find((item) => item.url.includes('/search'))
  assert.equal(call.url, '/channels/7/search')
  assert.deepEqual(call.params, { q: 'วัสดี' })
  assert.equal(call.headers.get('Authorization'), 'Bearer old-access')
  const result = ui.container.querySelector('[aria-label="Search results"] button')
  assert.match(result.textContent, /Teammate/)
  await act(async () => result.click())
  assert.equal(ui.container.querySelector('dialog'), null)
  const target = ui.container.querySelector('[data-message-id="1"]')
  assert.ok(target)
  assert.equal(target.dataset.scrolled, 'true')
  assert.equal(document.activeElement, target)
  assert.equal(ui.connection.getSnapshot().messages['7'].length, 2)
})

test('live search refreshes expired authentication once and displays the retried results', async (t) => {
  const ui = await setup(t, async (config) => {
    if (config.headers.get('Authorization') !== 'Bearer fresh-access') {
      throw new AxiosError('Expired', 'ERR_BAD_REQUEST', config, undefined, { config, status: 401, data: {}, headers: {} })
    }
    return reply(config, [oldMessage])
  })
  await ui.search('ทีม')
  assert.equal(ui.calls.filter((item) => item.url === '/auth/refresh').length, 1)
  assert.equal(ui.calls.filter((item) => item.url === '/channels/7/search').length, 2)
  assert.ok(ui.container.querySelector('[aria-label="Search results"] button'))
  assert.equal(ui.container.querySelector('[role="alert"]'), null)
})
