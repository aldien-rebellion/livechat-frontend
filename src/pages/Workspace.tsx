import { useEffect, useMemo, useRef, useState } from 'react'
import { Hash, Layers3, LockKeyhole, Menu, X } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import LiveChat from '../components/LiveChat'
import WebSocketProvider from '../contexts/WebSocketContext'
import { mockChannels, mockWorkspaces } from '../services/mockWorkspaceData'
import type { WorkspaceSelection } from '../types/workspace'
import { useAuth } from '../hooks/useAuth'
import { isMockAuth } from '../services/authService'
import { useWorkspaceChannels } from '../hooks/useWorkspaceChannels'
import { channelHasName } from '../services/channelService'

export default function Workspace() {
  const { session, logout } = useAuth()
  const [selection, setSelection] = useState<WorkspaceSelection>(() => {
    const workspaceId = mockWorkspaces[0]?.id ?? null
    return { workspaceId, channelId: mockChannels.find((channel) => channel.workspace_id === workspaceId)?.id ?? null }
  })
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const mock = import.meta.env.VITE_WS_MODE === 'mock' || (session?.access_token.startsWith('mock-only-') ?? false)
  const { channels, createChannel: saveChannel, syncError } = useWorkspaceChannels(session, selection.workspaceId, mock)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!sidebarOpen || !dialog) return
    dialog.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const desktop = window.matchMedia('(min-width: 768px)')
    const closeOnDesktop = () => { if (desktop.matches) setSidebarOpen(false) }
    desktop.addEventListener('change', closeOnDesktop)
    return () => {
      desktop.removeEventListener('change', closeOnDesktop)
      dialog.close()
      document.body.style.overflow = previousOverflow
    }
  }, [sidebarOpen])

  const workspace = mockWorkspaces.find((item) => item.id === selection.workspaceId)
  const workspaceChannels = useMemo(() => channels.filter((channel) => channel.workspace_id === selection.workspaceId), [channels, selection.workspaceId])
  const selectedChannel = workspaceChannels.find((channel) => channel.id === selection.channelId)
  const ChannelIcon = selectedChannel?.is_private ? LockKeyhole : Hash

  function selectWorkspace(workspaceId: string) {
    if (!mockWorkspaces.some((item) => item.id === workspaceId) || workspaceId === selection.workspaceId) return
    setSelection({ workspaceId, channelId: channels.find((channel) => channel.workspace_id === workspaceId)?.id ?? null })
  }

  function selectChannel(channelId: string) {
    if (!workspaceChannels.some((channel) => channel.id === channelId)) return
    setSelection({ ...selection, channelId })
    setSidebarOpen(false)
  }

  async function createChannel(name: string) {
    if (!selection.workspaceId) return
    if (workspaceChannels.some((channel) => channelHasName(channel, name))) throw new Error('This channel already exists.')
    const channel = await saveChannel(selection.workspaceId, name)
    setSelection((current) => current.workspaceId === channel.workspace_id ? { ...current, channelId: channel.id } : current)
  }

  const sidebarProps = {
    workspaces: mockWorkspaces,
    channels: workspaceChannels,
    selectedWorkspaceId: selection.workspaceId,
    selectedChannelId: selection.channelId,
    onSelectWorkspace: selectWorkspace,
    onSelectChannel: selectChannel,
    onCreateChannel: createChannel,
    mock,
  }

  return (
    <WebSocketProvider workspaceId={selection.workspaceId} channels={workspaceChannels}><div className="flex h-dvh min-h-0 overflow-hidden bg-slate-950 text-slate-100">
      <a href="#workspace-content" className="sr-only z-50 rounded bg-teal-300 p-3 text-slate-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to workspace content</a>
      <aside aria-label="Workspace sidebar" className="hidden h-full w-72 shrink-0 border-r border-slate-800 md:block"><Sidebar {...sidebarProps} /></aside>
      <dialog ref={dialogRef} aria-label="Workspace navigation" onCancel={() => setSidebarOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setSidebarOpen(false) }} className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-transparent p-0 text-slate-100 backdrop:bg-slate-950/75">
        {sidebarOpen && <div className="flex h-full w-[min(20rem,calc(100%_-_2rem))] flex-col border-r border-slate-700 bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2"><span className="text-sm font-semibold">Workspace navigation</span><button autoFocus type="button" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} className="rounded-lg p-3 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"><X aria-hidden="true" className="h-5 w-5" /></button></div>
          <div className="min-h-0 flex-1"><Sidebar {...sidebarProps} /></div>
        </div>}
      </dialog>
      <main id="workspace-content" tabIndex={-1} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden focus:outline-none">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-2 text-sm sm:px-8">
          <span className="min-w-0 break-all text-slate-300">{session?.user.full_name || session?.user.username} · {isMockAuth ? 'Mock auth' : 'Live Chat'}</span>
          <button type="button" onClick={logout} className="shrink-0 rounded-lg border border-slate-600 px-3 py-2 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300">Sign out</button>
        </div>
        <header className="flex min-h-20 shrink-0 items-center gap-3 border-b border-slate-800 px-4 py-4 sm:px-8">
          <button type="button" aria-label="Open sidebar" aria-haspopup="dialog" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(true)} className="shrink-0 rounded-lg border border-slate-700 p-3 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300 md:hidden"><Menu aria-hidden="true" className="h-5 w-5" /></button>
          <div className="min-w-0"><p className="break-words text-xs text-slate-400">{workspace?.name ?? 'Workspace'}</p><h1 className="mt-1 flex items-start gap-2 text-lg font-semibold"><ChannelIcon aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-teal-300" /><span className="min-w-0 break-words">{selectedChannel?.name ?? 'No channel selected'}</span></h1></div>
        </header>
        {syncError && <p role="status" className="px-4 py-2 text-sm text-amber-200 sm:px-8">{syncError}</p>}
        {selectedChannel ? <LiveChat key={`${selection.workspaceId}:${selectedChannel.id}`} channel={selectedChannel} /> : <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 py-12 sm:px-10">
          <section className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/50 p-6 sm:p-10">
            <Layers3 aria-hidden="true" className="mb-6 h-9 w-9 text-teal-300" />
            <p className="text-xs font-semibold uppercase tracking-widest text-teal-300">Your workspace</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">A fresh start for your workspace</h2>
            <p className="mt-4 leading-relaxed text-slate-400">This workspace has no channels yet. Open the sidebar and choose New channel to start a conversation.</p>
            <p role="status" className="mt-6 break-words rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm text-slate-300">{workspace?.name ?? 'No workspace'} / No channel selected</p>
          </section>
        </div>}
      </main>
    </div></WebSocketProvider>
  )
}
