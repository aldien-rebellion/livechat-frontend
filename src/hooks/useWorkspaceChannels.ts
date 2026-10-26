import { useEffect, useRef, useState } from 'react'
import { authService } from '../services/authService'
import { createChannelService, mergeChannels, replaceWorkspaceChannels } from '../services/channelService'
import { mockChannels } from '../services/mockWorkspaceData'
import type { AuthSession } from '../types/auth'
import type { Channel } from '../types/workspace'

const service = createChannelService(authService.api)

export function useWorkspaceChannels(session: AuthSession | null, workspaceId: string | null, mock: boolean) {
  const [channels, setChannels] = useState<Channel[]>(() => mock ? [...mockChannels] : [])
  const [syncError, setSyncError] = useState('')
  const revision = useRef(0)
  const mutating = useRef(0)

  useEffect(() => {
    if (mock || !session || !workspaceId) return
    const targetWorkspaceId = workspaceId
    const controller = new AbortController()
    let pending = false
    async function refresh() {
      if (pending || controller.signal.aborted || mutating.current) return
      pending = true
      const started = revision.current
      try {
        const incoming = await service.list(targetWorkspaceId, controller.signal)
        if (!controller.signal.aborted && started === revision.current) {
          setChannels((previous) => replaceWorkspaceChannels(previous, incoming, targetWorkspaceId))
          setSyncError('')
        }
      } catch {
        if (!controller.signal.aborted && started === revision.current) setSyncError('Unable to refresh channels. Retrying…')
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
    revision.current++
    mutating.current++
    try {
      const channel = mock
        ? { id: crypto.randomUUID(), workspace_id: targetWorkspaceId, name, is_private: false }
        : await service.create(targetWorkspaceId, name)
      setChannels((previous) => mergeChannels(previous, [channel]))
      return channel
    } finally { revision.current++; mutating.current-- }
  }

  async function deleteChannel(channel: Channel): Promise<void> {
    revision.current++
    mutating.current++
    try {
      if (!mock) await service.remove(channel.workspace_id, channel.id)
      setChannels((previous) => previous.filter((item) => item.id !== channel.id || item.workspace_id !== channel.workspace_id))
    } finally { revision.current++; mutating.current-- }
  }

  return { channels, createChannel, deleteChannel, syncError }
}
