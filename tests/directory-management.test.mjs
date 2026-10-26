import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import ts from 'typescript'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.Event = dom.window.Event
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { createElement, act } = await import('react')
const { createRoot } = await import('react-dom/client')
const directory = await mkdtemp(resolve('node_modules/.directory-tests-'))
for (const [name, sourcePath] of [
  ['channelService', 'services/channelService.ts'],
  ['workspaceService', 'services/workspaceService.ts'],
  ['mockWorkspaceData', 'services/mockWorkspaceData.ts'],
  ['useWorkspaceChannels', 'hooks/useWorkspaceChannels.ts'],
  ['useWorkspaceDirectory', 'hooks/useWorkspaceDirectory.ts'],
]) {
  const source = await readFile(new URL(`../src/${sourcePath}`, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText.replace(/from '\.\.\/services\/([^']+)'/g, "from './$1.mjs'")
  await writeFile(resolve(directory, `${name}.mjs`), output)
}
await writeFile(resolve(directory, 'authService.mjs'), `export const authService = { api: {
  get: (...args) => globalThis.directoryTestApi.get(...args),
  post: (...args) => globalThis.directoryTestApi.post(...args),
  delete: (...args) => globalThis.directoryTestApi.delete(...args),
} }`)
const load = (name) => import(pathToFileURL(resolve(directory, `${name}.mjs`)).href)
const { createWorkspaceService } = await load('workspaceService')
const { createChannelService, replaceWorkspaceChannels } = await load('channelService')
const { useWorkspaceDirectory } = await load('useWorkspaceDirectory')
const { useWorkspaceChannels } = await load('useWorkspaceChannels')
after(async () => { dom.window.close(); await rm(directory, { recursive: true, force: true }) })

const session = { access_token: 'test-access', user: { id: '3', is_admin: true } }
const workspace = (id = 'team', can_manage = true) => ({ id, name: `Workspace ${id}`, slug: `workspace-${id}`, can_manage })
const channel = (id = '10', workspace_id = 'team') => ({ id, workspace_id, name: `channel-${id}`, is_private: false })
const deferred = () => {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

async function hookSetup(t, kind, api, props = { session, workspaceId: 'team', mock: false }) {
  globalThis.directoryTestApi = api
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
  function Harness(next) {
    snapshot = kind === 'workspace'
      ? useWorkspaceDirectory(next.session, next.mock)
      : useWorkspaceChannels(next.session, next.workspaceId, next.mock)
    return null
  }
  const render = async (next) => act(async () => root.render(createElement(Harness, next)))
  await render(props)
  t.after(async () => {
    await act(async () => root.unmount())
    assert.equal(intervals.size, 0)
    container.remove()
    window.setInterval = originalSet
    window.clearInterval = originalClear
    delete globalThis.directoryTestApi
  })
  return {
    read: () => snapshot,
    items: () => kind === 'workspace' ? snapshot.workspaces : snapshot.channels,
    render,
    tick: () => act(async () => { for (const callback of intervals.values()) callback() }),
  }
}

test('management services encode delete targets and never send a client user ID for creation', async () => {
  const calls = []
  const api = {
    post: async (path, body) => { calls.push({ path, body }); return { data: path.endsWith('/channels') ? channel() : workspace() } },
    delete: async (path) => { calls.push({ path }); return { status: 204 } },
  }
  const workspaces = createWorkspaceService(api)
  const channels = createChannelService(api)
  await workspaces.create('Team')
  assert.deepEqual(calls.at(-1), { path: '/workspaces', body: { name: 'Team' } })
  await channels.create('team', 'general')
  assert.deepEqual(calls.at(-1), { path: '/workspaces/team/channels', body: { name: 'general' } })
  await workspaces.remove('a/b ?')
  assert.equal(calls.at(-1).path, '/workspaces/a%2Fb%20%3F')
  await channels.remove('a/b ?', '10/#')
  assert.equal(calls.at(-1).path, '/workspaces/a%2Fb%20%3F/channels/10%2F%23')
})

test('workspace service rejects malformed data including missing permission information', async () => {
  const signal = new AbortController().signal
  for (const data of [{}, [null], [{ ...workspace(), id: 3 }], [{ ...workspace(), can_manage: undefined }]]) {
    const service = createWorkspaceService({ get: async () => ({ data }) })
    await assert.rejects(service.list(signal), /Invalid workspace response/)
  }
})

test('channel snapshots replace the current workspace, retaining other workspaces and canonical IDs', () => {
  const current = [channel('general'), channel('20', 'design')]
  const replaced = replaceWorkspaceChannels(current, [channel('10')], 'team')
  assert.deepEqual(replaced, [channel('20', 'design'), channel('10')])
  assert.equal(replaceWorkspaceChannels(replaced, [channel('10')], 'team'), replaced)
  assert.deepEqual(replaceWorkspaceChannels(replaced, [], 'team'), [channel('20', 'design')])
})

for (const kind of ['workspace', 'channel']) {
  const record = () => kind === 'workspace' ? workspace() : channel()
  const remove = (hook, item) => kind === 'workspace' ? hook.deleteWorkspace(item) : hook.deleteChannel(item)
  const create = (hook) => kind === 'workspace' ? hook.createWorkspace('New workspace') : hook.createChannel('team', 'new-channel')

  test(`live ${kind} directory has no fake defaults and authoritative empty snapshots remove deleted entries`, async (t) => {
    const initial = deferred()
    let records = [record()]
    let count = 0
    const api = { get: async () => ++count === 1 ? initial.promise : { data: records } }
    const browser = await hookSetup(t, kind, api)
    assert.deepEqual(browser.items(), [])
    await act(async () => initial.resolve({ data: records }))
    assert.deepEqual(browser.items(), records)
    records = []
    await browser.tick()
    assert.deepEqual(browser.items(), [], 'a friend deletion propagates through an empty authoritative response')
  })

  test(`${kind} deletion waits for success and preserves the list after permission or network failure`, async (t) => {
    const item = record()
    let failure = { isAxiosError: true, response: { status: 403 } }
    const api = { get: async () => ({ data: [item] }), delete: async () => { throw failure } }
    const browser = await hookSetup(t, kind, api)
    await act(async () => assert.rejects(remove(browser.read(), item), (cause) => cause === failure))
    assert.deepEqual(browser.items(), [item])
    failure = new Error('offline')
    await act(async () => assert.rejects(remove(browser.read(), item), (cause) => cause === failure))
    assert.deepEqual(browser.items(), [item])
    api.delete = async () => ({ status: 204 })
    await act(async () => remove(browser.read(), item))
    assert.deepEqual(browser.items(), [])
  })

  test(`late ${kind} poll cannot resurrect a locally deleted entry`, async (t) => {
    const stale = deferred()
    const item = record()
    let count = 0
    const api = { get: async () => ++count === 1 ? { data: [item] } : stale.promise, delete: async () => ({ status: 204 }) }
    const browser = await hookSetup(t, kind, api)
    await browser.tick()
    await act(async () => remove(browser.read(), item))
    assert.deepEqual(browser.items(), [])
    await act(async () => stale.resolve({ data: [item] }))
    assert.deepEqual(browser.items(), [])
  })

  test(`late ${kind} poll cannot erase a newly created entry and polling pauses during mutations`, async (t) => {
    const stale = deferred()
    const creation = deferred()
    const item = record()
    let count = 0
    const api = { get: async () => ++count === 1 ? { data: [] } : stale.promise, post: async () => creation.promise }
    const browser = await hookSetup(t, kind, api)
    await browser.tick()
    let mutation
    await act(async () => { mutation = create(browser.read()) })
    await browser.tick()
    assert.equal(count, 2)
    await act(async () => creation.resolve({ data: item }))
    await mutation
    assert.deepEqual(browser.items(), [item])
    await act(async () => stale.resolve({ data: [] }))
    assert.deepEqual(browser.items(), [item])
  })
}

test('ordinary members cannot create a workspace even if they call the hook directly', async (t) => {
  let posts = 0
  const api = { get: async () => ({ data: [] }), post: async () => { posts++; return { data: workspace() } } }
  const member = { ...session, user: { ...session.user, is_admin: false } }
  const browser = await hookSetup(t, 'workspace', api, { session: member, mock: false })
  await act(async () => assert.rejects(browser.read().createWorkspace('No permission'), /Only admins/))
  assert.equal(posts, 0)
  assert.deepEqual(browser.items(), [])
})

test('workspace polling updates management permissions instead of preserving stale owner controls', async (t) => {
  let allowed = true
  const api = { get: async () => ({ data: [workspace('team', allowed)] }) }
  const browser = await hookSetup(t, 'workspace', api)
  assert.equal(browser.items()[0].can_manage, true)
  allowed = false
  await browser.tick()
  assert.equal(browser.items()[0].can_manage, false)
})

test('a replaced session aborts the old workspace request and ignores its late permission response', async (t) => {
  const stale = deferred()
  let count = 0
  let oldSignal
  const api = { get: async (_path, { signal }) => {
    count++
    if (count === 1) { oldSignal = signal; return stale.promise }
    return { data: [workspace('other', false)] }
  } }
  const browser = await hookSetup(t, 'workspace', api)
  await browser.render({ session: { ...session, access_token: 'rotated' }, mock: false })
  assert.equal(oldSignal.aborted, true)
  await act(async () => stale.resolve({ data: [workspace('team', true)] }))
  assert.deepEqual(browser.items(), [workspace('other', false)])
})
