import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Channel } from '../types/workspace'
import { useAuth } from '../hooks/useAuth'
import { ChatConnection } from '../services/chatConnection'
import { WebSocketContext } from './socketContext'
import type { createMockWebSocketAdapter } from '../services/mockWebSocketAdapter'

const mockEnabled = import.meta.env.DEV && import.meta.env.VITE_WS_MODE === 'mock'
const mockModule = mockEnabled ? import('../services/mockWebSocketAdapter') : undefined

export default function WebSocketProvider({ workspaceId, channels, children }: {
  workspaceId: string | null
  channels: Channel[]
  children: ReactNode
}) {
  const { session } = useAuth()
  const [client, setClient] = useState<{ adapter: ReturnType<typeof createMockWebSocketAdapter>; connection: ChatConnection } | null>(null)

  useEffect(() => {
    let cancelled = false
    let connection: ChatConnection | undefined
    void mockModule?.then((module) => {
      if (cancelled) return
      const adapter = module.createMockWebSocketAdapter()
      connection = new ChatConnection(adapter.factory, { initialMessages: adapter.initialMessages })
      setClient({ adapter, connection })
    })
    return () => { cancelled = true; connection?.dispose() }
  }, [])
  useEffect(() => {
    client?.connection.setScope(session && workspaceId ? { session, workspaceId, channels } : null)
  }, [client, session, workspaceId, channels])

  // Real mode awaits a confirmed decoder and real workspace/channel data.
  // Never send Issue #4's mock IDs to the real /ws endpoint.
  return <WebSocketContext value={client ? { connection: client.connection, mock: true, simulateDisconnect: client.adapter.disconnect, simulatePeer: client.adapter.peer } : null}>{children}</WebSocketContext>
}
