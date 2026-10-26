import type { ChatEvent, SocketFactory } from '../types/websocket'

export function webSocketUrl(
  endpoint: string,
  token: string,
  pageUrl: string,
  extraParams?: Record<string, string>
): string {
  const url = new URL(endpoint, pageUrl)
  if (url.protocol === 'https:') url.protocol = 'wss:'
  if (url.protocol === 'http:') url.protocol = 'ws:'
  if (!['ws:', 'wss:'].includes(url.protocol) || url.pathname !== '/ws' || url.username || url.password || url.hash) {
    throw new Error('Invalid WebSocket endpoint.')
  }
  if (new URL(pageUrl).protocol === 'https:' && url.protocol !== 'wss:') throw new Error('WSS is required.')
  if (!token || token.startsWith('mock-only-')) throw new Error('A real authenticated session is required.')
  url.searchParams.set('token', token)
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      if (value) url.searchParams.set(key, value)
    }
  }
  return url.href
}

export function decodeLiveEvent(data: unknown, workspaceId: string): ChatEvent | null {
  let parsed = data
  if (typeof data === 'string') {
    try {
      parsed = JSON.parse(data)
    } catch {
      return null
    }
  }
  if (!parsed || typeof parsed !== 'object') return null
  const event = parsed as Record<string, unknown>
  const targetWs = (event.workspaceId as string) || workspaceId

  if (event.type === 'user_typing') {
    if (!event.channelId || !event.userId) return null
    return {
      type: 'user_typing',
      workspaceId: targetWs,
      channelId: String(event.channelId),
      userId: String(event.userId),
      name: String(event.name || event.userId),
    }
  }

  if (event.type === 'new_message' && event.message && typeof event.message === 'object') {
    const msg = event.message as Record<string, unknown>
    const authorRaw = (msg.author as Record<string, unknown>) || {}
    const userId = String(msg.user_id || authorRaw.id || '')
    const authorName = String(authorRaw.full_name || msg.user_name || userId || 'User')
    return {
      type: 'new_message',
      workspaceId: targetWs,
      message: {
        id: String(msg.id || crypto.randomUUID()),
        channel_id: String(msg.channel_id),
        user_id: userId,
        content: String(msg.content || ''),
        created_at: String(msg.created_at || new Date().toISOString()),
        author: {
          id: userId,
          full_name: authorName,
        },
      },
    }
  }
  return null
}

export function createWebSocketAdapter(options: {
  endpoint: string
  pageUrl: string
  decode: (data: unknown, workspaceId: string) => ChatEvent | null
  createSocket?: (url: string) => WebSocket
}): SocketFactory {
  return (session, workspaceId, handlers) => {
    const url = webSocketUrl(options.endpoint, session.access_token, options.pageUrl, {
      workspace_id: workspaceId,
      user_id: session.user.id,
      user_name: session.user.full_name || session.user.username,
    })
    const socket = (options.createSocket ?? ((u) => new WebSocket(u)))(url)
    let disposed = false
    socket.onopen = () => { if (!disposed) handlers.open() }
    socket.onmessage = ({ data }) => {
      if (disposed) return
      try {
        const event = options.decode(data, workspaceId)
        if (event) handlers.event(event)
      } catch { /* Malformed/unsupported frames never reach UI. Never log token URLs. */ }
    }
    socket.onclose = ({ code }) => { if (!disposed) handlers.close(code) }
    socket.onerror = () => { if (!disposed) { handlers.close(1006); socket.close() } }
    return {
      send(frame) {
        if (disposed || socket.readyState !== 1 || socket.bufferedAmount > 65536) throw new Error('Connection unavailable.')
        socket.send(JSON.stringify(frame))
      },
      close() {
        disposed = true
        socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null
        socket.close()
      },
    }
  }
}
