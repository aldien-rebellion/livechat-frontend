import { createContext } from 'react'
import type { ChatConnection } from '../services/chatConnection'

export const WebSocketContext = createContext<{
  connection: ChatConnection
  mock: boolean
  simulateDisconnect?: () => void
  simulatePeer?: (channelId: string, typing: boolean) => void
} | null>(null)
