import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import type { Channel } from '../types/workspace'
import type { Message } from '../types/message'
import type { SearchService } from '../types/search'
import SearchModal from './SearchModal'

const mockModule = import.meta.env.DEV && import.meta.env.VITE_SEARCH_MODE === 'mock'
  ? import('../services/mockSearchService') : undefined

export default function SearchMessages({ channel, messages, mockChat, onSelect }: {
  channel: Channel; messages: Message[]; mockChat: boolean; onSelect: (message: Message) => void
}) {
  const [open, setOpen] = useState(false)
  const [service, setService] = useState<SearchService | null>(null)
  const messagesRef = useRef(messages)
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => {
    let cancelled = false
    if (mockChat) void mockModule?.then(({ createMockSearchService }) => {
      if (!cancelled) setService(createMockSearchService(() => messagesRef.current))
    })
    return () => { cancelled = true }
  }, [mockChat])
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
        // Do not open over the mobile navigation dialog or another modal.
        if (document.querySelector('dialog[open]') && !open) return
        event.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [open])

  return <>
    <button type="button" aria-haspopup="dialog" aria-expanded={open} aria-keyshortcuts="Control+k Meta+k" onClick={() => setOpen(true)}
      className="mt-2 flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300">
      <Search aria-hidden="true" className="h-4 w-4" />Search messages <kbd className="hidden text-xs text-slate-400 sm:inline">Ctrl K</kbd>
    </button>
    {open && <SearchModal channel={channel} service={mockChat ? service : null} onClose={() => setOpen(false)} onSelect={(message) => { setOpen(false); onSelect(message) }} />}
  </>
}
