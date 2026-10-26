import type { AxiosInstance } from 'axios'
import type { Channel } from '../types/workspace'

function decodeChannel(value: unknown, workspaceId: string): Channel {
  if (!value || typeof value !== 'object') throw new Error('Invalid channel response.')
  const channel = value as Partial<Channel>
  if (typeof channel.id !== 'string' || !channel.id || channel.workspace_id !== workspaceId ||
      typeof channel.name !== 'string' || !channel.name || typeof channel.is_private !== 'boolean') {
    throw new Error('Invalid channel response.')
  }
  return channel as Channel
}

export function createChannelService(api: Pick<AxiosInstance, 'get' | 'post' | 'delete'>) {
  const path = (workspaceId: string) => `/workspaces/${encodeURIComponent(workspaceId)}/channels`
  return {
    async list(workspaceId: string, signal: AbortSignal): Promise<Channel[]> {
      const { data } = await api.get<unknown>(path(workspaceId), { signal })
      if (!Array.isArray(data)) throw new Error('Invalid channel response.')
      return data.map((value) => decodeChannel(value, workspaceId))
    },
    async create(workspaceId: string, name: string): Promise<Channel> {
      const { data } = await api.post<unknown>(path(workspaceId), { name })
      return decodeChannel(data, workspaceId)
    },
    async remove(workspaceId: string, channelId: string): Promise<void> {
      await api.delete(`${path(workspaceId)}/${encodeURIComponent(channelId)}`)
    },
  }
}

export function replaceWorkspaceChannels(current: Channel[], incoming: Channel[], workspaceId: string): Channel[] {
  const existing = current.filter((channel) => channel.workspace_id === workspaceId)
  if (existing.length === incoming.length && existing.every((channel, index) =>
    channel.id === incoming[index].id && channel.name === incoming[index].name && channel.is_private === incoming[index].is_private)) return current
  return [...current.filter((channel) => channel.workspace_id !== workspaceId), ...incoming]
}

const legacyChannelRefs = new Set(['general', 'frontend', 'planning', 'reviews', 'inspiration'])

export function channelHasName(channel: Channel, name: string): boolean {
  const normalized = name.toLowerCase()
  return channel.name.toLowerCase() === normalized ||
    (legacyChannelRefs.has(channel.id) && channel.id === normalized)
}

// Keep default references for their old history; new rooms use server IDs.
export function mergeChannels(current: Channel[], incoming: Channel[]): Channel[] {
  const merged = [...current]
  for (const channel of incoming) {
    const exists = merged.some((item) => item.workspace_id === channel.workspace_id &&
      (item.id === channel.id || channelHasName(item, channel.name)))
    if (!exists) merged.push(channel)
  }
  return merged.length === current.length ? current : merged
}
