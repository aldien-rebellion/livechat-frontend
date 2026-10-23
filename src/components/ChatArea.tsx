import { useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, MessageCircle } from 'lucide-react'
import type { Channel } from '../types/workspace'
import type { Message } from '../types/message'
import MessageInput from './MessageInput'
import MessageItem from './MessageItem'

interface ChatAreaProps {
  channel: Channel
  messages: Message[]
  currentUserId: string
  onSend: (content: string) => void
}

// The parent keys this component by channel so drafts and scroll state cannot cross rooms.
export default function ChatArea({ channel, messages, currentUserId, onSend }: ChatAreaProps) {
  const historyRef = useRef<HTMLDivElement>(null)
  const followLatest = useRef(true)
  const [showLatest, setShowLatest] = useState(false)

  function scrollToLatest() {
    const history = historyRef.current
    if (history) history.scrollTop = history.scrollHeight
    followLatest.current = true
    setShowLatest(false)
  }

  useLayoutEffect(() => {
    const history = historyRef.current
    if (history && followLatest.current) history.scrollTop = history.scrollHeight
  }, [messages])

  return (
    <section aria-label={`Chat in ${channel.name}`} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={historyRef} role="region" aria-label={`Message history for ${channel.name}`} tabIndex={0} onScroll={(event) => {
          const history = event.currentTarget
          const nearBottom = history.scrollHeight - history.scrollTop - history.clientHeight < 48
          followLatest.current = nearBottom
          setShowLatest(!nearBottom)
        }} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-300 sm:px-5">
          {messages.length > 0 ? (
            <ol aria-label="Messages" aria-live="polite" aria-relevant="additions" className="mx-auto w-full max-w-4xl">{messages.map((message) => <MessageItem key={message.id} message={message} isOwn={message.user_id === currentUserId} />)}</ol>
          ) : (
            <div className="flex min-h-full items-center justify-center px-4 py-8 text-center">
              <div className="max-w-md"><MessageCircle aria-hidden="true" className="mx-auto mb-5 h-10 w-10 text-teal-300" /><h2 className="break-words text-xl font-semibold">Start the conversation in #{channel.name}</h2><p className="mt-3 text-sm leading-6 text-slate-400">No messages yet. Be the first to say hello.</p></div>
            </div>
          )}
        </div>
        {showLatest && <button type="button" onClick={scrollToLatest} className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-slate-600 bg-slate-800 px-4 py-3 text-sm shadow-lg hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"><ArrowDown aria-hidden="true" className="h-4 w-4" />Jump to latest</button>}
      </div>
      <MessageInput channelName={channel.name} onSend={(content) => { followLatest.current = true; setShowLatest(false); onSend(content) }} />
    </section>
  )
}
