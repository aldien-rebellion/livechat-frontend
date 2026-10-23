import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Hash, LockKeyhole, Plus } from 'lucide-react'
import type { Channel } from '../types/workspace'

interface ChannelListProps {
  channels: Channel[]
  selectedChannelId: string | null
  onSelectChannel: (channelId: string) => void
  onCreateChannel: (name: string) => void
}

export default function ChannelList({ channels, selectedChannelId, onSelectChannel, onCreateChannel }: ChannelListProps) {
  const id = useId()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  function cancel() {
    setCreating(false)
    setName('')
    setError('')
    document.getElementById(`${id}-trigger`)?.focus()
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedName = name.trim().toLowerCase()
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedName) || normalizedName.length > 50) {
      setError('Use 1–50 letters, numbers, and single hyphens between words.')
      return
    }
    if (channels.some((channel) => channel.name.toLowerCase() === normalizedName)) {
      setError('This channel name already exists in this workspace.')
      return
    }
    onCreateChannel(normalizedName)
    cancel()
  }

  return (
    <section aria-label="Channels" className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Channels</h2>
        <button id={`${id}-trigger`} type="button" aria-expanded={creating} aria-controls={creating ? `${id}-form` : undefined} onClick={() => creating ? cancel() : setCreating(true)} className="flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium text-teal-200 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300">
          <Plus aria-hidden="true" className="h-4 w-4" /> New channel
        </button>
      </div>
      {creating && (
        <form id={`${id}-form`} onSubmit={submit} onKeyDown={(event) => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel() }
        }} className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/50 p-3">
          <label htmlFor={`${id}-name`} className="block text-sm font-medium text-slate-200">Channel name</label>
          <input id={`${id}-name`} autoFocus value={name} onChange={(event) => { setName(event.target.value); setError('') }} maxLength={50} required aria-invalid={!!error} aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`} placeholder="e.g. project-updates" className="w-full min-w-0 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-teal-300 focus:outline-none focus:ring-1 focus:ring-teal-300" />
          <p id={`${id}-help`} className="text-xs leading-relaxed text-slate-400">Letters, numbers and hyphens. Mock only; resets on reload.</p>
          {error && <p id={`${id}-error`} role="alert" className="text-xs text-rose-300">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="min-h-11 rounded-lg bg-teal-300 px-3 text-sm font-semibold text-slate-950 hover:bg-teal-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300">Create channel</button>
            <button type="button" onClick={cancel} className="min-h-11 rounded-lg px-3 text-sm text-slate-300 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300">Cancel</button>
          </div>
        </form>
      )}
      <nav aria-label="Workspace channels" className="space-y-1">
        {channels.length === 0 && <p className="px-3 py-4 text-sm leading-relaxed text-slate-400">No channels yet. Create a channel to get started.</p>}
        {channels.map((channel) => {
          const selected = channel.id === selectedChannelId
          const Icon = channel.is_private ? LockKeyhole : Hash
          return (
            <button key={channel.id} type="button" aria-current={selected ? 'true' : undefined} onClick={() => onSelectChannel(channel.id)} className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 ${selected ? 'bg-teal-300 font-semibold text-slate-950' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 break-words">{channel.name}</span>
              {channel.is_private && <span className="sr-only">Private channel</span>}
              {selected && <span className="sr-only">Selected</span>}
            </button>
          )
        })}
      </nav>
    </section>
  )
}
