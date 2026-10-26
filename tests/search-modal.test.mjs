import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import ts from 'typescript'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><body><button id="opener">Search</button><div id="root"></div></body>', { url: 'http://localhost' })
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Event', 'KeyboardEvent', 'MouseEvent']) globalThis[key] = dom.window[key]
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
// JSDOM has no native modal implementation: real Escape/inert/focus and layout
// are also checked in Browser. Here we exercise React lifecycle and handlers.
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }

const { createElement, act } = await import('react')
const { createRoot } = await import('react-dom/client')
const directory = await mkdtemp(resolve('node_modules/.search-modal-tests-'))
const source = await readFile(new URL('../src/components/SearchModal.tsx', import.meta.url), 'utf8')
await writeFile(resolve(directory, 'SearchModal.mjs'), ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText)
const { default: SearchModal } = await import(pathToFileURL(resolve(directory, 'SearchModal.mjs')).href)
after(async () => { dom.window.close(); await rm(directory, { recursive: true, force: true }) })

const channel = { id: 'c1', workspace_id: 'w1', name: 'general', is_private: false }
const result = { id: 'm1', channel_id: 'c1', content: '<script>สวัสดี</script>', author: { id: 'u1', full_name: 'Maya Chen' }, created_at: '2026-10-23T02:00:00Z' }
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function setup(t, service) {
  const root = createRoot(document.getElementById('root'))
  const calls = { closed: 0, selected: [] }
  document.getElementById('opener').focus()
  await act(async () => root.render(createElement(SearchModal, { channel, service,
    mock: true,
    onClose: () => calls.closed++, onSelect: (message) => calls.selected.push(message),
  })))
  t.after(async () => { await act(async () => root.unmount()) })
  const input = document.getElementById('message-search')
  const type = async (value) => act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  return { root, calls, input, type }
}

test('modal labels, initial focus, debounce, loading, result metadata, plain text and selection', async (t) => {
  let resolveSearch
  const requests = []
  const { input, type, calls } = await setup(t, { search: (request) => {
    requests.push(request)
    return new Promise((resolve) => { resolveSearch = resolve })
  } })
  assert.equal(document.activeElement, input)
  assert.ok(document.querySelector('dialog[open][aria-labelledby="search-title"]'))
  assert.match(document.body.textContent, /Demo search/)
  await type('first')
  await type('สวัสดี')
  assert.equal(requests.length, 0)
  assert.match(document.body.textContent, /Searching…/)
  await act(async () => pause(280))
  assert.equal(requests.length, 1)
  assert.equal(requests[0].query, 'สวัสดี')
  assert.equal(requests[0].workspaceId, 'w1')
  assert.equal(requests[0].channel.id, 'c1')
  await act(async () => resolveSearch([result]))
  const button = document.querySelector('ol button')
  assert.match(button.textContent, /Maya Chen/)
  assert.match(button.textContent, /#general/)
  assert.equal(button.querySelector('time').dateTime, result.created_at)
  assert.match(button.textContent, /<script>สวัสดี<\/script>/)
  assert.equal(button.querySelector('script'), null)
  assert.equal(document.activeElement, input, 'results must not steal focus')
  await act(async () => button.click())
  assert.deepEqual(calls.selected, [result])
})

test('empty results, whitespace reset and disabled integration-pending mode make no unintended requests', async (t) => {
  let count = 0
  const { type } = await setup(t, { search: async () => { count++; return [] } })
  await type('missing')
  await act(async () => pause(280))
  assert.match(document.body.textContent, /No messages found/)
  await type('   ')
  await act(async () => pause(280))
  assert.equal(count, 1)
  assert.match(document.body.textContent, /Enter text/)
})

test('failure exposes alert and Retry; successful retry clears error', async (t) => {
  let count = 0
  const { type } = await setup(t, { search: async () => {
    if (++count === 1) throw new Error('Network unavailable')
    return [result]
  } })
  await type('hello')
  await act(async () => pause(280))
  assert.match(document.querySelector('[role="alert"]').textContent, /Unable to search/)
  await act(async () => document.querySelector('[role="alert"] button').click())
  assert.match(document.body.textContent, /Searching…/)
  await act(async () => pause(280))
  assert.equal(count, 2)
  assert.equal(document.querySelector('[role="alert"]'), null)
  assert.ok(document.querySelector('ol button'))
})

test('new queries, clear and unmount abort work; late results cannot overwrite the newest query', async (t) => {
  const requests = []
  const pending = []
  const { type, root } = await setup(t, { search: (request) => {
    requests.push(request)
    return new Promise((resolve) => pending.push(resolve))
  } })
  await type('old')
  await act(async () => pause(280))
  await type('new')
  assert.equal(requests[0].signal.aborted, true)
  await act(async () => pause(280))
  await act(async () => pending[1]([]))
  await act(async () => pending[0]([result]))
  assert.match(document.body.textContent, /No messages found/)
  assert.equal(document.querySelector('ol'), null)
  await type('third')
  await act(async () => pause(280))
  await type('')
  assert.equal(requests[2].signal.aborted, true)
  await type('fourth')
  await act(async () => pause(280))
  await act(async () => root.unmount())
  assert.equal(requests[3].signal.aborted, true)
  await act(async () => pending[3]([result]))
  assert.equal(document.querySelector('dialog'), null)
  assert.equal(document.activeElement.id, 'opener')
})

test('Tab boundaries wrap inside modal; native cancel and close button call onClose', async (t) => {
  const { input, calls } = await setup(t, null)
  assert.equal(input.disabled, true)
  assert.match(document.body.textContent, /Search is unavailable/)
  const close = document.querySelector('dialog button')
  close.focus()
  close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
  assert.equal(document.activeElement, close)
  close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
  assert.equal(document.activeElement, close)
  await act(async () => document.querySelector('dialog').dispatchEvent(new Event('cancel')))
  await act(async () => close.click())
  await act(async () => close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
  assert.equal(calls.closed, 3)
})
