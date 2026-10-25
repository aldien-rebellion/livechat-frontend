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
  const [client] = useState(() => {
    const adapter = createMockWebSocketAdapter()
    const connection = new ChatConnection(adapter.factory, { initialMessages: adapter.initialMessages })
    return { adapter, connection }
  })

  useEffect(() => {
    return () => {
      client.connection.dispose()
    }
  }, [client])

  useEffect(() => {
    client.connection.setScope(session && workspaceId ? { session, workspaceId, channels } : null)
  }, [client, session, workspaceId, channels])

  return (
    <WebSocketContext
      value={{
        connection: client.connection,
        mock: true,
        simulateDisconnect: client.adapter.disconnect,
        simulatePeer: client.adapter.peer,
      }}
    >
      {children}
    </WebSocketContext>
  )
}
