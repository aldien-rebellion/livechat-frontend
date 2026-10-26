import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import axios from 'axios'
import { Layers3 } from 'lucide-react'

interface Props {
  onCreate: (name: string) => Promise<void>
  onClose: () => void
}

export default function CreateWorkspaceDialog({ onCreate, onClose }: Props) {
  const id = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingRef = useRef(false)
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

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

  function close() {
    if (!pendingRef.current) onClose()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pendingRef.current) return
    const cleanName = name.trim()
    if (!cleanName || cleanName.length > 100) {
      setError('Use a workspace name between 1 and 100 characters.')
      return
    }
    pendingRef.current = true
    setPending(true)
    setError('')
    try {
      await onCreate(cleanName)
      onClose()
    } catch (cause) {
      const status = axios.isAxiosError(cause) ? cause.response?.status : undefined
      setError(status === 403
        ? 'Only administrators can create workspaces.'
        : status === 409
          ? 'A workspace with this name already exists.'
          : 'Unable to create workspace. Please try again.')
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
    <h2 id={`${id}-title`} className="flex items-center gap-2 text-lg font-semibold"><Layers3 aria-hidden="true" className="h-5 w-5 text-teal-300" />Create workspace</h2>
    <p id={`${id}-details`} className="mt-3 text-sm leading-6 text-slate-300">Create a workspace for your team. Members can create channels inside it.</p>
    <form onSubmit={submit} className="mt-5 space-y-4" aria-busy={pending}>
      <label htmlFor={`${id}-name`} className="block text-sm font-medium">Workspace name</label>
      <input ref={inputRef} id={`${id}-name`} value={name} onChange={(event) => { setName(event.target.value); setError('') }}
        disabled={pending} maxLength={100} autoComplete="off" placeholder="e.g. Product team"
        className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm focus:border-teal-300 focus:outline-none focus:ring-1 focus:ring-teal-300" />
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      <div className="flex flex-wrap justify-end gap-3">
        <button type="button" disabled={pending} onClick={close} className="min-h-11 rounded-lg border border-slate-600 px-4 py-2 text-sm hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300 disabled:opacity-50">Cancel</button>
        <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-teal-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300 disabled:opacity-50">{pending ? 'Creating…' : 'Create workspace'}</button>
      </div>
    </form>
  </dialog>
}
