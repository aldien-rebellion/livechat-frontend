import type { ChatEvent, SocketFactory } from '../types/websocket'

export function webSocketUrl(endpoint: string, token: string, pageUrl: string): string {
  const url = new URL(endpoint, pageUrl)
  if (url.protocol === 'https:') url.protocol = 'wss:'
  if (url.protocol === 'http:') url.protocol = 'ws:'
  if (!['ws:', 'wss:'].includes(url.protocol) || url.pathname !== '/ws' || url.username || url.password || url.hash) {
    throw new Error('Invalid WebSocket endpoint.')
  }
  if (new URL(pageUrl).protocol === 'https:' && url.protocol !== 'wss:') throw new Error('WSS is required.')
  if (!token || token.startsWith('mock-only-')) throw new Error('A real authenticated session is required.')
  url.searchParams.set('token', token)
  return url.href
}

// Backend inbound envelopes and auth close codes are still unspecified.
// Integration supplies a confirmed decoder; do not reuse the mock event schema.
export function createWebSocketAdapter(options: {
  endpoint: string
  pageUrl: string
  decode: (data: unknown, workspaceId: string) => ChatEvent | null
  createSocket?: (url: string) => WebSocket
}): SocketFactory {
  return (session, workspaceId, handlers) => {
    const socket = (options.createSocket ?? ((url) => new WebSocket(url)))(webSocketUrl(options.endpoint, session.access_token, options.pageUrl))
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
