import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Send } from 'lucide-react'

interface MessageInputProps {
  channelName: string
  onSend: (content: string) => void
}

export default function MessageInput({ channelName, onSend }: MessageInputProps) {
  const id = useId()
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const content = draft.trim()
    if (!content) return
    onSend(content)
    setDraft('')
    inputRef.current?.focus()
  }

  return (
    <form onSubmit={submit} className="shrink-0 border-t border-slate-800 bg-slate-950 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-8">
      <label htmlFor={id} className="mb-2 block break-words text-sm font-medium text-slate-300">Message #{channelName}</label>
      <div className="rounded-xl border border-slate-700 bg-slate-900 focus-within:border-teal-300 focus-within:ring-1 focus-within:ring-teal-300">
        <textarea ref={inputRef} id={id} value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} aria-describedby={`${id}-help`} placeholder={`Write to #${channelName}`} onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
            event.preventDefault()
            event.currentTarget.form?.requestSubmit()
          }
        }} className="block max-h-48 min-h-20 w-full resize-y rounded-t-xl bg-transparent px-4 py-3 text-base text-slate-100 placeholder:text-slate-500 focus:outline-none" />
        <div className="flex items-center justify-between gap-3 px-3 pb-3">
          <p id={`${id}-help`} className="text-xs leading-5 text-slate-400">Enter to send · Shift+Enter for a new line</p>
          <button type="submit" disabled={!draft.trim()} aria-label="Send message" className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-teal-300 px-3 font-semibold text-slate-950 hover:bg-teal-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 disabled:cursor-not-allowed disabled:opacity-40"><Send aria-hidden="true" className="h-4 w-4" /><span className="hidden text-sm sm:inline">Send</span></button>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-400">Local demo · Messages reset on reload.</p>
    </form>
  )
}
