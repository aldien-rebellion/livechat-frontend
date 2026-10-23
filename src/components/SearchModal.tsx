import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { Channel } from '../types/workspace'
import type { Message } from '../types/message'
import type { SearchService } from '../types/search'

interface Props {
  channel: Channel
  service: SearchService | null
  onClose: () => void
  onSelect: (message: Message) => void
}
type SearchState = { status: 'idle' | 'loading' | 'success' | 'error'; results: Message[] }
const focusStyle = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300'

export default function SearchModal({ channel, service, onClose, onSelect }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<SearchState>({ status: 'idle', results: [] })

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    dialog.showModal()
    inputRef.current?.focus()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [])

  useEffect(() => {
    if (!service || !query.trim()) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void service.search({ workspaceId: channel.workspace_id, channel, query, signal: controller.signal })
        .then((results) => { if (!controller.signal.aborted) setState({ status: 'success', results }) })
        .catch(() => { if (!controller.signal.aborted) setState({ status: 'error', results: [] }) })
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, attempt, service, channel])

  return <dialog ref={dialogRef} aria-labelledby="search-title" aria-describedby="search-scope" onCancel={onClose}
    onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); return }
      if (event.key !== 'Tab') return
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'))
      const first = controls[0]
      const last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_1rem)] max-w-2xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 p-0 text-slate-100 shadow-2xl backdrop:bg-slate-950/80">
    <div className="flex max-h-[90dvh] flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 sm:px-6">
        <h2 id="search-title" className="flex items-center gap-2 font-semibold"><Search aria-hidden="true" className="h-5 w-5 text-teal-300" />Search messages</h2>
        <button type="button" aria-label="Close search" onClick={onClose} className={`rounded-lg p-3 hover:bg-slate-800 ${focusStyle}`}><X aria-hidden="true" className="h-5 w-5" /></button>
      </header>
      <div className="shrink-0 space-y-3 p-4 sm:px-6">
        <p id="search-scope" className="break-words text-sm text-slate-300">Search in #{channel.name} · current workspace only</p>
        <p className="text-xs text-amber-200">{service ? 'Mock search · local chat messages only · no Backend API' : 'Search unavailable · Backend integration pending. No API request is sent.'}</p>
        <label htmlFor="message-search" className="sr-only">Search message text</label>
        <input ref={inputRef} id="message-search" type="search" autoComplete="off" maxLength={500} disabled={!service}
          value={query} onChange={(event) => { const value = event.target.value; setQuery(value); setState({ status: value.trim() ? 'loading' : 'idle', results: [] }) }}
          placeholder="Search message text…" className={`w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-base disabled:opacity-50 ${focusStyle}`} />
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6" aria-busy={state.status === 'loading'}>
        <p role="status" className="py-3 text-sm text-slate-400">{!service ? 'Search will be available after Backend integration.' : state.status === 'idle' ? 'Enter text to search this channel.' : state.status === 'loading' ? 'Searching…' : state.status === 'success' ? state.results.length ? `${state.results.length} result(s) · up to 30 · newest first` : 'No messages found. Try a different search.' : ''}</p>
        {state.status === 'error' && <div role="alert" className="rounded-xl border border-rose-400/40 p-4 text-sm"><p>Unable to search messages. Please try again.</p><button type="button" onClick={() => { setState({ status: 'loading', results: [] }); setAttempt((value) => value + 1) }} className={`mt-3 rounded-lg border border-slate-600 px-4 py-2 ${focusStyle}`}>Retry search</button></div>}
        {state.status === 'success' && state.results.length > 0 && <ol aria-label="Search results" className="space-y-2">{state.results.map((message) => <li key={message.id}>
          <button type="button" onClick={() => onSelect(message)} className={`w-full rounded-xl border border-slate-700 bg-slate-950/50 p-4 text-left hover:border-teal-300 ${focusStyle}`}>
            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><span className="break-words font-semibold [overflow-wrap:anywhere]">{message.author.full_name}</span><time dateTime={message.created_at} className="text-xs text-slate-400">{new Date(message.created_at).toLocaleString()}</time></span>
            <span className="mt-2 block whitespace-pre-wrap break-words text-sm text-slate-300 [overflow-wrap:anywhere]">{message.content}</span>
            <span className="mt-3 block break-words text-xs text-teal-300">#{channel.name} · Jump to message</span>
          </button>
        </li>)}</ol>}
      </div>
      <footer className="shrink-0 border-t border-slate-800 px-4 py-3 text-xs text-slate-400 sm:px-6">Tab / Shift+Tab to navigate · Enter to select · Escape to close</footer>
    </div>
  </dialog>
}
