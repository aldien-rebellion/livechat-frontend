import type { AuthSession } from './auth'
import type { Message } from './message'

// Client frames documented in the team's Blueprint §3.1. No invented unsubscribe.
export type ClientFrame =
  | { action: 'subscribe'; channel_id: string }
  | { action: 'send_message'; channel_id: string; content: string }
  | { action: 'typing'; channel_id: string }
  | { action: 'heartbeat' }

// Internal normalized events, NOT a confirmed Backend wire format.
export type ChatEvent =
  | { type: 'error'; workspaceId: string; message: string }
  | { type: 'new_message'; workspaceId: string; message: Message }
  | { type: 'user_typing'; workspaceId: string; channelId: string; userId: string; name: string }

export interface SocketHandlers {
  open: () => void
  event: (event: ChatEvent) => void
  close: (code: number) => void
}
export interface ChatSocket {
  send: (frame: ClientFrame) => void
  close: () => void
}
export type SocketFactory = (session: AuthSession, workspaceId: string, handlers: SocketHandlers) => ChatSocket
export type ConnectionState = 'connecting' | 'connected' | 'disconnected'
