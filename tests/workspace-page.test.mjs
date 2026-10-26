import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import ts from 'typescript'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost' })
for (const key of ['window', 'document', 'HTMLElement', 'Event', 'KeyboardEvent']) globalThis[key] = dom.window[key]
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
const { createElement, act } = await import('react')
const { createRoot } = await import('react-dom/client')
const directory = await mkdtemp(resolve('node_modules/.workspace-page-tests-'))
const source = await readFile(new URL('../src/pages/Workspace.tsx', import.meta.url), 'utf8')
await writeFile(resolve(directory, 'Workspace.mjs'), ts.transpileModule(source.replace(/import\.meta\.env\.VITE_WS_MODE/g, "'live'"), { compilerOptions: {
  module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText.replace(/from '\.\.\/[^']*\/([^'/]+)'/g, "from './$1.mjs'"))
const stubs = {
  'useAuth': 'export const useAuth = () => globalThis.workspacePageState.auth',
  'authService': 'export const isMockAuth = false',
  'useWorkspaceDirectory': 'export const useWorkspaceDirectory = () => globalThis.workspacePageState.directory',
  'useWorkspaceChannels': 'export const useWorkspaceChannels = (_session, id) => { globalThis.workspacePageState.channelWorkspace = id; return globalThis.workspacePageState.channelHook }',
  'channelService': 'export const channelHasName = (channel, name) => channel.name.toLowerCase() === name.toLowerCase()',
  'mockWorkspaceData': `export const mockWorkspaces = [{id:'team',name:'Team',slug:'team'}]; export const mockChannels = [{id:'general',workspace_id:'team',name:'general',is_private:false}]`,
  'Sidebar': 'export default function Sidebar(props) { globalThis.workspacePageState.sidebar = props; return null }',
  'LiveChat': `import {createElement} from 'react'; export default function LiveChat({channel}) { return createElement('div',{'data-testid':'live-chat','data-channel':channel.id,'data-workspace':channel.workspace_id},channel.name) }`,
  'WebSocketContext': 'export default function Provider({children,...scope}) { globalThis.workspacePageState.socketScope = scope; return children }',
  'ConfirmDeleteDialog': 'export default function ConfirmDelete(props) { globalThis.workspacePageState.confirm = props; return null }',
  'CreateWorkspaceDialog': 'export default function CreateWorkspace(props) { globalThis.workspacePageState.create = props; return null }',
}
for (const [name, value] of Object.entries(stubs)) await writeFile(resolve(directory, `${name}.mjs`), value)
const { default: Workspace } = await import(pathToFileURL(resolve(directory, 'Workspace.mjs')).href)
after(async () => { dom.window.close(); await rm(directory, { recursive: true, force: true }) })

const workspace = (id, can_manage = true) => ({ id, name: `Workspace ${id}`, slug: id, can_manage })
const channel = (id, workspace_id = 'team') => ({ id, workspace_id, name: `channel-${id}`, is_private: false })
const deferred = () => {
  let resolve
  const promise = new Promise((res) => { resolve = res })
  return { promise, resolve }
}

async function setup(t) {
  const state = {
    auth: { session: { user: { id: '3', username: 'User', is_admin: true }, access_token: 'real-access' }, logout() {} },
    directory: { workspaces: [workspace('team'), workspace('design')], syncError: '', createWorkspace: async () => workspace('created'), deleteWorkspace: async () => {} },
    channelHook: { channels: [channel('10'), channel('11'), channel('20', 'design')], syncError: '', createChannel: async () => channel('created'), deleteChannel: async () => {} },
  }
  globalThis.workspacePageState = state
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const render = () => act(async () => root.render(createElement(Workspace)))
  await render()
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    delete globalThis.workspacePageState
  })
  return { state, container, render }
}

test('removing the selected channel falls back to a surviving room, then to the empty state', async (t) => {
  const page = await setup(t)
  await act(async () => page.state.sidebar.onSelectChannel('11'))
  assert.equal(page.container.querySelector('[data-testid="live-chat"]').dataset.channel, '11')
  page.state.channelHook.channels = page.state.channelHook.channels.filter((item) => item.id !== '11')
  await page.render()
  assert.equal(page.state.sidebar.selectedChannelId, '10')
  assert.equal(page.container.querySelector('[data-testid="live-chat"]').dataset.channel, '10')
  assert.deepEqual(page.state.socketScope.channels.map((item) => item.id), ['10'])
  page.state.channelHook.channels = [channel('20', 'design')]
  await page.render()
  assert.equal(page.state.sidebar.selectedChannelId, null)
  assert.equal(page.container.querySelector('[data-testid="live-chat"]'), null)
  assert.match(page.container.textContent, /This workspace has no channels yet/)
})

test('removing the current workspace switches scope to a remaining workspace and safely handles deleting all', async (t) => {
  const page = await setup(t)
  page.state.directory.workspaces = [workspace('design')]
  await page.render()
  assert.equal(page.state.sidebar.selectedWorkspaceId, 'design')
  assert.equal(page.state.channelWorkspace, 'design')
  assert.equal(page.state.socketScope.workspaceId, 'design')
  assert.equal(page.container.querySelector('[data-testid="live-chat"]').dataset.channel, '20')
  page.state.directory.workspaces = []
  await page.render()
  assert.equal(page.state.sidebar.selectedWorkspaceId, null)
  assert.equal(page.state.socketScope.workspaceId, null)
  assert.deepEqual(page.state.socketScope.channels, [])
  assert.equal(page.container.querySelector('[data-testid="live-chat"]'), null)
  assert.match(page.container.textContent, /No workspaces available/)
})

test('management controls follow refreshed workspace permissions and the logged-in admin flag', async (t) => {
  const page = await setup(t)
  assert.equal(page.state.sidebar.canManage, true)
  assert.equal(typeof page.state.sidebar.onCreateWorkspace, 'function')
  page.state.directory.workspaces = [workspace('team', false), workspace('design')]
  page.state.auth.session = { ...page.state.auth.session, user: { ...page.state.auth.session.user, is_admin: false } }
  await page.render()
  assert.equal(page.state.sidebar.canManage, false)
  assert.equal(page.state.sidebar.onCreateWorkspace, undefined)
})

test('deletion is not sent until confirmation and retains the target after switching workspace', async (t) => {
  const page = await setup(t)
  const deleted = []
  page.state.channelHook.deleteChannel = async (item) => deleted.push(item)
  const target = page.state.channelHook.channels[1]
  await act(async () => page.state.sidebar.onDeleteChannel(target))
  assert.deepEqual(deleted, [])
  assert.equal(page.state.confirm.kind, 'channel')
  assert.equal(page.state.confirm.name, target.name)
  await act(async () => page.state.sidebar.onSelectWorkspace('design'))
  await act(async () => page.state.confirm.onConfirm())
  assert.deepEqual(deleted, [target])
})

test('a pending channel creation does not move the user back after they switch workspace', async (t) => {
  const page = await setup(t)
  const request = deferred()
  const created = channel('created', 'team')
  page.state.channelHook.createChannel = async () => {
    const result = await request.promise
    page.state.channelHook.channels = [...page.state.channelHook.channels, result]
    return result
  }
  let creation
  await act(async () => { creation = page.state.sidebar.onCreateChannel('new-channel') })
  await act(async () => {
    page.state.sidebar.onSelectWorkspace('design')
    request.resolve(created)
    await creation
  })
  assert.equal(page.state.sidebar.selectedWorkspaceId, 'design')
  assert.equal(page.state.socketScope.workspaceId, 'design')
  assert.equal(page.container.querySelector('[data-testid="live-chat"]').dataset.workspace, 'design')
})
