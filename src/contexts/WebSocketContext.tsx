import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Channel } from '../types/workspace'
import type { ChannelMessages } from '../types/message'
import { useAuth } from '../hooks/useAuth'
import { ChatConnection } from '../services/chatConnection'
import { WebSocketContext } from './socketContext'
import { createMockWebSocketAdapter } from '../services/mockWebSocketAdapter'
import { createWebSocketAdapter, decodeLiveEvent } from '../services/webSocketAdapter'
import { createMockMessages } from '../services/mockMessageData'
import { authService } from '../services/authService'
import type { Message } from '../types/message'

// The old cache may contain unrelated history returned for unknown channels.
const MSG_STORAGE_PREFIX = 'livechat_stored_messages_v2_'

function loadStoredMessages(channels: Channel[], mock = false): ChannelMessages {
  const fallback = mock ? createMockMessages() : {}
  if (typeof window === 'undefined' || !window.localStorage) {
    return Object.fromEntries(channels.map((channel) => [channel.id, fallback[channel.id] ?? []]))
  }
  try {
    const raw = window.localStorage.getItem(MSG_STORAGE_PREFIX)
    if (raw) {
      const parsed = JSON.parse(raw) as ChannelMessages
      if (parsed && typeof parsed === 'object') {
        const result: ChannelMessages = {}
        for (const ch of channels) {
          result[ch.id] = parsed[ch.id] && parsed[ch.id].length > 0 ? parsed[ch.id] : (fallback[ch.id] ?? [])
        }
        return result
      }
    }
  } catch {
    // Ignore storage parse error
  }
  return Object.fromEntries(channels.map((channel) => [channel.id, fallback[channel.id] ?? []]))
}

function saveMessagesToStorage(messages: ChannelMessages) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(MSG_STORAGE_PREFIX, JSON.stringify(messages))
  } catch {
    // Ignore storage write error
  }
}

export default function WebSocketProvider({ workspaceId, channels, children }: {
  workspaceId: string | null
  channels: Channel[]
  children: ReactNode
}) {
  const { session } = useAuth()
  const isMock = import.meta.env.VITE_WS_MODE === 'mock' || (session?.access_token.startsWith('mock-only-') ?? false)

  const [client] = useState(() => {
    if (isMock) {
      const adapter = createMockWebSocketAdapter()
      const connection = new ChatConnection(adapter.factory, {
        initialMessages: (chList) => loadStoredMessages(chList, true),
      })
      return { adapter, connection, mock: true }
    }

    const factory = createWebSocketAdapter({
      endpoint: '/ws',
      pageUrl: typeof window !== 'undefined' ? window.location.href : 'http://localhost/',
      decode: decodeLiveEvent,
    })
    const connection = new ChatConnection(factory, {
      refresh: authService.refresh,
      isAuthClose: (code) => code === 4401,
    })
    return { adapter: null, connection, mock: false }
  })

  useEffect(() => {
    return () => {
      client.connection.dispose()
    }
  }, [client])

  useEffect(() => {
    if (!client.mock) return
    // Save messages whenever connection updates
    const unsubscribe = client.connection.subscribe(() => {
      const snapshot = client.connection.getSnapshot()
      if (snapshot.messages && Object.keys(snapshot.messages).length > 0) {
        saveMessagesToStorage(snapshot.messages)
      }
    })
    return unsubscribe
  }, [client])

  useEffect(() => {
    client.connection.setScope(session && workspaceId ? { session, workspaceId, channels } : null)
  }, [client, session, workspaceId, channels])

  useEffect(() => {
    if (isMock || !session || !workspaceId || channels.length === 0) return
    const controller = new AbortController()
    for (const channel of channels) {
      void authService.api.get<Message[]>(`/channels/${encodeURIComponent(channel.id)}/messages`, {
        params: { limit: 50 }, signal: controller.signal,
      }).then(({ data }) => {
        if (!controller.signal.aborted && Array.isArray(data)) client.connection.mergeHistory(workspaceId, channel.id, data)
      }).catch(() => { /* Directory polling removes unavailable rooms. */ })
    }
    return () => controller.abort()
  }, [client, session, channels, isMock, workspaceId])

  return (
    <WebSocketContext
      value={{
        connection: client.connection,
        mock: client.mock,
        simulateDisconnect: client.adapter?.disconnect,
        simulatePeer: client.adapter?.peer,
      }}
    >
      {children}
    </WebSocketContext>
  )
}
