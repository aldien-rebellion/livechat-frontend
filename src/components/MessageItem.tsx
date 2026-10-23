import type { Message } from '../types/message'

interface MessageItemProps {
  message: Message
  isOwn: boolean
}

export default function MessageItem({ message, isOwn }: MessageItemProps) {
  const date = new Date(message.created_at)
  const initials = message.author.full_name.trim().split(/\s+/).slice(0, 2).map((name) => Array.from(name)[0]).join('')

  return (
    <li className="flex min-w-0 gap-3 rounded-xl px-2 py-3 hover:bg-slate-900/60 sm:px-3">
      <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${isOwn ? 'bg-teal-300 text-slate-950' : 'bg-indigo-400/15 text-indigo-200'}`}>{initials}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="break-words text-sm font-semibold text-slate-100">{message.author.full_name}</span>
          <time dateTime={message.created_at} title={date.toLocaleString()} className="text-xs text-slate-400">{date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300 [overflow-wrap:anywhere]">{message.content}</p>
      </div>
    </li>
  )
}
