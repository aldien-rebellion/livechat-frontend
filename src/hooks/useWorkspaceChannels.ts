import { useEffect, useState } from 'react'
import { authService } from '../services/authService'
import { createChannelService, mergeChannels } from '../services/channelService'
import { mockChannels } from '../services/mockWorkspaceData'
import type { AuthSession } from '../types/auth'
import type { Channel } from '../types/workspace'

const service = createChannelService(authService.api)

export function useWorkspaceChannels(session: AuthSession | null, workspaceId: string | null, mock: boolean) {
  const [channels, setChannels] = useState<Channel[]>(() => [...mockChannels])
  const [syncError, setSyncError] = useState('')

  useEffect(() => {
    if (mock || !session || !workspaceId) return
    const targetWorkspaceId = workspaceId
    const controller = new AbortController()
    let pending = false
    async function refresh() {
      if (pending || controller.signal.aborted) return
      pending = true
      try {
        const incoming = await service.list(targetWorkspaceId, controller.signal)
        if (!controller.signal.aborted) {
          setChannels((previous) => mergeChannels(previous, incoming))
          setSyncError('')
        }
      } catch {
        if (!controller.signal.aborted) setSyncError('Unable to refresh channels. Retrying…')
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
  }, [session, workspaceId, mock])

  async function createChannel(targetWorkspaceId: string, name: string): Promise<Channel> {
    if (!session) throw new Error('Please sign in again.')
    const channel = mock
      ? { id: crypto.randomUUID(), workspace_id: targetWorkspaceId, name, is_private: false }
      : await service.create(targetWorkspaceId, name, session.user.id)
    setChannels((previous) => mergeChannels(previous, [channel]))
    return channel
  }

  return { channels, createChannel, syncError }
}
