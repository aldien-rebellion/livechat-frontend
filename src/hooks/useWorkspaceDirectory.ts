import { useEffect, useRef, useState } from 'react'
import { authService } from '../services/authService'
import { createWorkspaceService } from '../services/workspaceService'
import { mockWorkspaces } from '../services/mockWorkspaceData'
import type { AuthSession } from '../types/auth'
import type { Workspace } from '../types/workspace'

const service = createWorkspaceService(authService.api)

export function useWorkspaceDirectory(session: AuthSession | null, mock: boolean) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => mock ? [...mockWorkspaces] : [])
  const [syncError, setSyncError] = useState('')
  const revision = useRef(0)
  const mutating = useRef(0)

  useEffect(() => {
    if (mock || !session) return
    const controller = new AbortController()
    let pending = false
    async function refresh() {
      if (pending || controller.signal.aborted || mutating.current) return
      pending = true
      const started = revision.current
      try {
        const incoming = await service.list(controller.signal)
        if (!controller.signal.aborted && started === revision.current) {
          setWorkspaces((previous) => JSON.stringify(previous) === JSON.stringify(incoming) ? previous : incoming)
          setSyncError('')
        }
      } catch {
        if (!controller.signal.aborted && started === revision.current) setSyncError('Unable to refresh workspaces. Retrying…')
      } finally { pending = false }
    }
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 3000)
    window.addEventListener('focus', refresh)
    return () => {
      controller.abort()
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [session, mock])

  async function createWorkspace(name: string): Promise<Workspace> {
    if (!session?.user.is_admin) throw new Error('Only admins can create workspaces.')
    revision.current++
    mutating.current++
    try {
      const workspace = mock
        ? { id: crypto.randomUUID(), name, slug: name.toLowerCase().replace(/\s+/g, '-'), can_manage: true }
        : await service.create(name)
      setWorkspaces((previous) => [...previous, workspace])
      return workspace
    } finally { revision.current++; mutating.current-- }
  }

  async function deleteWorkspace(workspace: Workspace): Promise<void> {
    revision.current++
    mutating.current++
    try {
      if (!mock) await service.remove(workspace.id)
      setWorkspaces((previous) => previous.filter((item) => item.id !== workspace.id))
    } finally { revision.current++; mutating.current-- }
  }

  return { workspaces, createWorkspace, deleteWorkspace, syncError }
}
