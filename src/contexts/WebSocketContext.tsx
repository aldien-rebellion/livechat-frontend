import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Channel } from '../types/workspace'
import { useAuth } from '../hooks/useAuth'
import { ChatConnection } from '../services/chatConnection'
import { WebSocketContext } from './socketContext'
import { createMockWebSocketAdapter } from '../services/mockWebSocketAdapter'

export default function WebSocketProvider({ workspaceId, channels, children }: {
  workspaceId: string | null
  channels: Channel[]
  children: ReactNode
}) {
  const { session } = useAuth()
  const [client, setClient] = useState<{ adapter: ReturnType<typeof createMockWebSocketAdapter>; connection: ChatConnection } | null>(null)

  useEffect(() => {
    let cancelled = false
    const adapter = createMockWebSocketAdapter()
    const connection = new ChatConnection(adapter.factory, { initialMessages: adapter.initialMessages })
    if (!cancelled) {
      setClient({ adapter, connection })
    }
    return () => {
      cancelled = true
      connection.dispose()
    }
  }, [])

  useEffect(() => {
    client?.connection.setScope(session && workspaceId ? { session, workspaceId, channels } : null)
  }, [client, session, workspaceId, channels])

  return (
    <WebSocketContext
      value={
        client
          ? {
              connection: client.connection,
              mock: true,
              simulateDisconnect: client.adapter.disconnect,
              simulatePeer: client.adapter.peer,
            }
          : null
      }
    >
      {children}
    </WebSocketContext>
  )
}
