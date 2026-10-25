import type { ChatEvent, SocketFactory } from '../types/websocket'
import { createMockMessages } from './mockMessageData'
import type { Channel } from '../types/workspace'

// Development/test adapter only. This envelope is a mock convention, not Backend #13's schema.
export function decodeMockEvent(data: unknown): ChatEvent | null {
  if (!data || typeof data !== 'object') return null
  const event = data as Record<string, unknown>
  if (typeof event.workspaceId !== 'string') return null
  if (event.type === 'user_typing') {
    if (![event.channelId, event.userId, event.name].every((value) => typeof value === 'string' && value.length > 0)) return null
    return data as ChatEvent
  }
  if (event.type !== 'new_message' || !event.message || typeof event.message !== 'object') return null
  const message = event.message as Record<string, unknown>
  if (![message.id, message.channel_id, message.user_id, message.content, message.created_at].every((value) => typeof value === 'string' && value.length > 0)) return null
  if (!Number.isFinite(Date.parse(message.created_at as string))) return null
  if (!message.author || typeof message.author !== 'object') return null
  const author = message.author as Record<string, unknown>
  if (author.id !== message.user_id || typeof author.full_name !== 'string') return null
  return data as ChatEvent
}

export function createMockWebSocketAdapter() {
  const connections = new Set<{ disconnect: () => void; peer: (channelId: string, typing: boolean) => void }>()
  const factory: SocketFactory = (session, workspaceId, handlers) => {
    let closed = false
    let opened = false
    const subscriptions = new Set<string>()
    const bus = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`livechat-issue6-mock:${workspaceId}`)
    const receive = (data: unknown) => {
      const event = decodeMockEvent(data)
      if (!closed && opened && event && event.workspaceId === workspaceId && subscriptions.has(event.type === 'new_message' ? event.message.channel_id : event.channelId)) handlers.event(event)
    }
    if (bus) bus.onmessage = ({ data }) => receive(data)
    function publish(event: ChatEvent) { receive(event); bus?.postMessage(event) }
    const opening = setTimeout(() => { if (!closed) { opened = true; handlers.open() } }, 100)
    const close = () => {
      if (closed) return
      closed = true
      opened = false
      clearTimeout(opening)
      bus?.close()
      connections.delete(control)
    }
    const control = {
      disconnect() { close(); handlers.close(1006) },
      peer(channelId: string, typing: boolean) {
        if (typing) publish({ type: 'user_typing', workspaceId, channelId, userId: 'mock-peer', name: 'Mock teammate' })
        else publish({ type: 'new_message', workspaceId, message: {
          id: crypto.randomUUID(), channel_id: channelId, user_id: 'mock-peer',
          content: 'ข้อความทดสอบจาก Mock teammate', created_at: new Date().toISOString(),
          author: { id: 'mock-peer', full_name: 'Mock teammate' },
        } })
      },
    }
    connections.add(control)
    return {
      send(frame) {
        if (!opened || closed) throw new Error('Mock connection is closed.')
        if (frame.action === 'subscribe') { subscriptions.add(frame.channel_id); return }
        if (frame.action === 'heartbeat') return
        if (!subscriptions.has(frame.channel_id)) throw new Error('Channel is not subscribed.')
        if (frame.action === 'typing') publish({ type: 'user_typing', workspaceId, channelId: frame.channel_id, userId: session.user.id, name: session.user.full_name || session.user.username })
        else publish({ type: 'new_message', workspaceId, message: {
          id: crypto.randomUUID(), channel_id: frame.channel_id, content: frame.content,
          user_id: session.user.id, created_at: new Date().toISOString(),
          author: { id: session.user.id, full_name: session.user.full_name || session.user.username },
        } })
      },
      close,
    }
  }
  return {
    factory,
    initialMessages: (channels: Channel[]) => {
      const history = createMockMessages()
      return Object.fromEntries(channels.map((channel) => [channel.id, history[channel.id] ?? []]))
    },
    disconnect: () => connections.forEach((connection) => connection.disconnect()),
    peer: (channelId: string, typing: boolean) => connections.forEach((connection) => connection.peer(channelId, typing)),
  }
}
