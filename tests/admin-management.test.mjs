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
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
const { createElement, act } = await import('react')
const { createRoot } = await import('react-dom/client')
const directory = await mkdtemp(resolve('node_modules/.admin-ui-tests-'))
for (const [name, sourcePath] of [
  ['channelService', 'services/channelService.ts'],
  ['WorkspaceList', 'components/WorkspaceList.tsx'],
  ['ChannelList', 'components/ChannelList.tsx'],
  ['ConfirmDeleteDialog', 'components/ConfirmDeleteDialog.tsx'],
  ['CreateWorkspaceDialog', 'components/CreateWorkspaceDialog.tsx'],
]) {
  const source = await readFile(new URL(`../src/${sourcePath}`, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText.replace(/from '\.\.\/services\/([^']+)'/g, "from './$1.mjs'")
  await writeFile(resolve(directory, `${name}.mjs`), output)
}
const load = (name) => import(pathToFileURL(resolve(directory, `${name}.mjs`)).href)
const { default: WorkspaceList } = await load('WorkspaceList')
const { default: ChannelList } = await load('ChannelList')
const { default: ConfirmDeleteDialog } = await load('ConfirmDeleteDialog')
const { default: CreateWorkspaceDialog } = await load('CreateWorkspaceDialog')
after(async () => { dom.window.close(); await rm(directory, { recursive: true, force: true }) })

const workspace = { id: 'team', name: 'Team', slug: 'team', can_manage: false }
const channel = { id: '12', name: 'general', workspace_id: 'team', is_private: false }
const deferred = () => {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

async function setup(t, Component, props) {
  const opener = document.createElement('button')
  opener.textContent = 'Open'
  const container = document.createElement('div')
  document.body.append(opener, container)
  opener.focus()
  const root = createRoot(container)
  const render = (next) => act(async () => root.render(createElement(Component, next)))
  await render(props)
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    opener.remove()
  })
  const type = (input, value) => act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const submit = () => act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  return { container, opener, root, render, type, submit }
}

test('ordinary members can create channels but have no workspace-create or delete controls', async (t) => {
  const list = await setup(t, WorkspaceList, { workspaces: [workspace], selectedWorkspaceId: 'team', onSelectWorkspace() {}, onDeleteWorkspace() {} })
  assert.equal(list.container.querySelector('[aria-label^="Delete workspace"]'), null)
  assert.doesNotMatch(list.container.textContent, /New workspace/)
  const channels = await setup(t, ChannelList, { channels: [channel], selectedChannelId: channel.id, onSelectChannel() {}, onCreateChannel() {}, canManage: false, onDeleteChannel() {} })
  assert.match(channels.container.textContent, /New channel/)
  assert.equal(channels.container.querySelector('[aria-label^="Delete channel"]'), null)
})

test('owners get scoped delete controls while only supplied admin action exposes workspace creation', async (t) => {
  const managed = { ...workspace, can_manage: true }
  const deleted = []
  let selected = 0
  let created = 0
  const props = { workspaces: [managed, { ...workspace, id: 'other', name: 'Other' }], selectedWorkspaceId: 'team', onSelectWorkspace: () => selected++, onDeleteWorkspace: (target) => deleted.push(target) }
  const list = await setup(t, WorkspaceList, props)
  assert.equal(list.container.querySelectorAll('[aria-label^="Delete workspace"]').length, 1)
  await act(async () => list.container.querySelector('[aria-label="Delete workspace Team"]').click())
  assert.deepEqual(deleted, [managed])
  assert.equal(selected, 0, 'deleting does not switch workspace')
  assert.doesNotMatch(list.container.textContent, /New workspace/)
  await list.render({ ...props, onCreateWorkspace: () => created++ })
  await act(async () => [...list.container.querySelectorAll('button')].find((button) => button.textContent.includes('New workspace')).click())
  assert.equal(created, 1)

  const channels = await setup(t, ChannelList, { channels: [channel], selectedChannelId: channel.id, onSelectChannel: () => selected++, onCreateChannel() {}, canManage: true, onDeleteChannel: (target) => deleted.push(target) })
  await act(async () => channels.container.querySelector('[aria-label="Delete channel general"]').click())
  assert.equal(selected, 0)
  assert.deepEqual(deleted.at(-1), channel)
  assert.equal(channels.container.querySelector('button button'), null)
})

test('delete confirmation starts on Cancel, describes cascading deletion and never deletes on cancel', async (t) => {
  let confirmations = 0
  let closed = 0
  const modal = await setup(t, ConfirmDeleteDialog, { kind: 'workspace', name: 'Team', onConfirm: async () => confirmations++, onClose: () => closed++ })
  assert.equal(document.activeElement.textContent, 'Cancel')
  assert.match(modal.container.textContent, /all its channels and messages/)
  assert.match(modal.container.textContent, /cannot be undone/)
  assert.equal(modal.container.querySelector('[type="submit"]').disabled, true)
  await modal.submit()
  assert.equal(confirmations, 0)
  await act(async () => [...modal.container.querySelectorAll('button')].find((button) => button.textContent === 'Cancel').click())
  assert.equal(closed, 1)
  assert.equal(confirmations, 0)
  await act(async () => modal.root.unmount())
  assert.equal(document.activeElement, modal.opener, 'closing restores focus to its opener')
})

test('delete requires exact name, submits once while pending and blocks Escape until settled', async (t) => {
  const request = deferred()
  let calls = 0
  let closed = 0
  const modal = await setup(t, ConfirmDeleteDialog, { kind: 'channel', name: 'general', onConfirm: () => { calls++; return request.promise }, onClose: () => closed++ })
  assert.match(modal.container.textContent, /every message in this channel/)
  const input = modal.container.querySelector('input')
  await modal.type(input, 'GENERAL')
  await modal.submit()
  assert.equal(calls, 0)
  await modal.type(input, 'general')
  await modal.submit()
  await modal.submit()
  assert.equal(calls, 1)
  assert.equal(input.disabled, true)
  assert.equal(modal.container.querySelector('[type="button"]').disabled, true)
  await act(async () => modal.container.querySelector('dialog').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
  await act(async () => modal.container.querySelector('dialog').dispatchEvent(new Event('cancel', { cancelable: true })))
  assert.equal(closed, 0)
  await act(async () => request.resolve())
  assert.equal(closed, 1)
})

test('delete failure preserves confirmation and enables retry without claiming success', async (t) => {
  let calls = 0
  let closed = 0
  const modal = await setup(t, ConfirmDeleteDialog, { kind: 'workspace', name: 'Team', onConfirm: async () => { if (++calls === 1) throw new Error('offline') }, onClose: () => closed++ })
  const input = modal.container.querySelector('input')
  await modal.type(input, 'Team')
  await modal.submit()
  assert.equal(closed, 0)
  assert.equal(input.value, 'Team')
  assert.equal(input.disabled, false)
  assert.match(modal.container.querySelector('[role="alert"]').textContent, /Unable to delete workspace/)
  await modal.submit()
  assert.equal(calls, 2)
  assert.equal(closed, 1)
})

test('delete permission revocation reports an error and leaves the dialog open', async (t) => {
  let closed = 0
  const modal = await setup(t, ConfirmDeleteDialog, { kind: 'channel', name: 'general', onConfirm: async () => { throw { isAxiosError: true, response: { status: 403 } } }, onClose: () => closed++ })
  await modal.type(modal.container.querySelector('input'), 'general')
  await modal.submit()
  assert.match(modal.container.querySelector('[role="alert"]').textContent, /no longer have permission/)
  assert.equal(closed, 0)
})

test('workspace creation trims names, waits for success and retains the draft after errors', async (t) => {
  const first = deferred()
  const names = []
  let closed = 0
  const modal = await setup(t, CreateWorkspaceDialog, { onCreate: (name) => { names.push(name); return names.length === 1 ? first.promise : Promise.resolve() }, onClose: () => closed++ })
  const input = modal.container.querySelector('input')
  await modal.type(input, '   ')
  await modal.submit()
  assert.match(modal.container.querySelector('[role="alert"]').textContent, /between 1 and 100/)
  assert.equal(names.length, 0)
  await modal.type(input, '  Product team  ')
  await modal.submit()
  await modal.submit()
  assert.deepEqual(names, ['Product team'])
  assert.equal(input.disabled, true)
  assert.equal(closed, 0)
  await act(async () => first.reject({ isAxiosError: true, response: { status: 409 } }))
  assert.match(modal.container.querySelector('[role="alert"]').textContent, /already exists/)
  assert.equal(input.value, '  Product team  ')
  assert.equal(input.disabled, false)
  await modal.submit()
  assert.deepEqual(names, ['Product team', 'Product team'])
  assert.equal(closed, 1)
})

test('server refusal to create a workspace is shown without clearing its name', async (t) => {
  const modal = await setup(t, CreateWorkspaceDialog, { onCreate: async () => { throw { isAxiosError: true, response: { status: 403 } } }, onClose() {} })
  const input = modal.container.querySelector('input')
  await modal.type(input, 'Team')
  await modal.submit()
  assert.match(modal.container.querySelector('[role="alert"]').textContent, /Only administrators/)
  assert.equal(input.value, 'Team')
})
