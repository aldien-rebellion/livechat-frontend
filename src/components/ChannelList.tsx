import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Hash, LockKeyhole, Plus, Trash2 } from 'lucide-react'
import axios from 'axios'
import { channelHasName } from '../services/channelService'
import type { Channel } from '../types/workspace'

interface ChannelListProps {
  channels: Channel[]
  selectedChannelId: string | null
  onSelectChannel: (channelId: string) => void
  onCreateChannel: (name: string) => void | Promise<void>
  mock?: boolean
  canManage?: boolean
  onDeleteChannel?: (channel: Channel) => void
}

export default function ChannelList({ channels, selectedChannelId, onSelectChannel, onCreateChannel, mock = false, canManage = false, onDeleteChannel }: ChannelListProps) {
  const id = useId()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  function cancel() {
    if (pending) return
    setCreating(false)
    setName('')
    setError('')
    document.getElementById(`${id}-trigger`)?.focus()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const normalizedName = name.trim().toLowerCase()
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedName) || normalizedName.length > 50) {
      setError('Use 1–50 letters, numbers, and single hyphens between words.')
      return
    }
    if (channels.some((channel) => channelHasName(channel, normalizedName))) {
      setError('This channel name already exists in this workspace.')
      return
    }
    setPending(true)
    setError('')
    try {
      await onCreateChannel(normalizedName)
      setCreating(false)
      setName('')
      document.getElementById(`${id}-trigger`)?.focus()
    } catch (cause) {
      setError(axios.isAxiosError(cause) && cause.response?.status === 409
        ? 'This channel name already exists in this workspace.'
        : 'Unable to create channel. Please try again.')
    } finally { setPending(false) }
  }

  return (
    <section aria-label="Channels" className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Channels</h2>
        <button id={`${id}-trigger`} type="button" disabled={pending} aria-expanded={creating} aria-controls={creating ? `${id}-form` : undefined} onClick={() => creating ? cancel() : setCreating(true)} className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium text-teal-200 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300">
          <Plus aria-hidden="true" className="h-4 w-4" /> New channel
        </button>
      </div>
      {creating && (
        <form id={`${id}-form`} onSubmit={submit} onKeyDown={(event) => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel() }
        }} className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/50 p-3">
          <label htmlFor={`${id}-name`} className="block text-sm font-medium text-slate-200">Channel name</label>
          <input id={`${id}-name`} autoFocus disabled={pending} value={name} onChange={(event) => { setName(event.target.value); setError('') }} maxLength={50} required aria-invalid={!!error} aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`} placeholder="e.g. project-updates" className="w-full min-w-0 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-teal-300 focus:outline-none focus:ring-1 focus:ring-teal-300" />
          <p id={`${id}-help`} className="text-xs leading-relaxed text-slate-400">Letters, numbers and hyphens. {mock ? 'Demo channel; resets on reload.' : 'Shared with everyone in this workspace.'}</p>
          {error && <p id={`${id}-error`} role="alert" className="text-xs text-rose-300">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-teal-300 px-3 text-sm font-semibold text-slate-950 hover:bg-teal-200 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300">{pending ? 'Creating…' : 'Create channel'}</button>
            <button type="button" disabled={pending} onClick={cancel} className="min-h-11 rounded-lg px-3 text-sm text-slate-300 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300">Cancel</button>
          </div>
        </form>
      )}
      <nav aria-label="Workspace channels" className="space-y-1">
        {channels.length === 0 && <p className="px-3 py-4 text-sm leading-relaxed text-slate-400">No channels yet. Create a channel to get started.</p>}
        {channels.map((channel) => {
          const selected = channel.id === selectedChannelId
          const Icon = channel.is_private ? LockKeyhole : Hash
          return (
            <div key={channel.id} className="flex items-center gap-1">
              <button type="button" aria-current={selected ? 'true' : undefined} onClick={() => onSelectChannel(channel.id)} className={`flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 ${selected ? 'bg-teal-300 font-semibold text-slate-950' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 break-words">{channel.name}</span>
                {channel.is_private && <span className="sr-only">Private channel</span>}
                {selected && <span className="sr-only">Selected</span>}
              </button>
              {canManage && onDeleteChannel && <button type="button" aria-label={`Delete channel ${channel.name}`} onClick={() => onDeleteChannel(channel)} className="min-h-11 shrink-0 rounded-lg px-2 text-slate-400 hover:bg-rose-950 hover:text-rose-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-300"><Trash2 aria-hidden="true" className="h-4 w-4" /></button>}
            </div>
          )
        })}
      </nav>
    </section>
  )
}
