import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import axios from 'axios'
import { Trash2 } from 'lucide-react'

interface Props {
  kind: 'channel' | 'workspace'
  name: string
  onConfirm: () => Promise<void>
  onClose: () => void
}

export default function ConfirmDeleteDialog({ kind, name, onConfirm, onClose }: Props) {
  const id = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const pendingRef = useRef(false)
  const [confirmation, setConfirmation] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    dialog.showModal()
    cancelRef.current?.focus()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [])

  function close() {
    if (!pendingRef.current) onClose()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pendingRef.current || confirmation !== name) return
    pendingRef.current = true
    setPending(true)
    setError('')
    try {
      await onConfirm()
      onClose()
    } catch (cause) {
      const status = axios.isAxiosError(cause) ? cause.response?.status : undefined
      setError(status === 403
        ? `You no longer have permission to delete this ${kind}.`
        : status === 404 || status === 410
          ? `This ${kind} has already been removed. Close this dialog to refresh the list.`
          : `Unable to delete ${kind}. Please try again.`)
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }

  return <dialog ref={dialogRef} aria-labelledby={`${id}-title`} aria-describedby={`${id}-details`}
    onCancel={(event) => { event.preventDefault(); close() }}
    onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
      if (event.key !== 'Tab') return
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'))
      const first = controls[0]
      const last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}
    onClick={(event) => { if (event.target === event.currentTarget) close() }}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-100 shadow-2xl backdrop:bg-slate-950/80">
    <h2 id={`${id}-title`} className="flex items-center gap-2 text-lg font-semibold"><Trash2 aria-hidden="true" className="h-5 w-5 text-rose-300" />Delete {kind}</h2>
    <p id={`${id}-details`} className="mt-4 break-words text-sm leading-6 text-slate-300">{kind === 'channel'
      ? `Deleting #${name} permanently deletes every message in this channel.`
      : `Deleting ${name} permanently deletes all its channels and messages.`} This cannot be undone.</p>
    <form onSubmit={submit} className="mt-5 space-y-4" aria-busy={pending}>
      <label htmlFor={`${id}-confirmation`} className="block break-words text-sm">Type <strong>{name}</strong> to confirm.</label>
      <input id={`${id}-confirmation`} value={confirmation} disabled={pending} autoComplete="off" spellCheck={false}
        onChange={(event) => { setConfirmation(event.target.value); setError('') }}
        className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm focus:border-rose-300 focus:outline-none focus:ring-1 focus:ring-rose-300" />
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      {pending && <p role="status" className="text-sm text-slate-400">Deleting {kind}…</p>}
      <div className="flex flex-wrap justify-end gap-3">
        <button ref={cancelRef} type="button" disabled={pending} onClick={close} className="min-h-11 rounded-lg border border-slate-600 px-4 py-2 text-sm hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300 disabled:opacity-50">Cancel</button>
        <button type="submit" disabled={pending || confirmation !== name} className="min-h-11 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-300 disabled:opacity-40">{pending ? 'Deleting…' : `Delete ${kind}`}</button>
      </div>
    </form>
  </dialog>
}
