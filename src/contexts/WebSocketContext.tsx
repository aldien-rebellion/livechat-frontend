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
      initialMessages: (chList) => loadStoredMessages(chList),
    })
    return { adapter: null, connection, mock: false }
  })

  useEffect(() => {
    return () => {
      client.connection.dispose()
    }
  }, [client])

  useEffect(() => {
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
    if (isMock || !session || channels.length === 0) return
    let active = true

    const fetchHistory = async () => {
      try {
        const snap = client.connection.getSnapshot()
        const updated: ChannelMessages = { ...snap.messages }
        let hasNew = false

        for (const ch of channels) {
          try {
            const res = await fetch(`/api/v1/channels/${ch.id}/messages?limit=50`, {
              headers: { Authorization: `Bearer ${session.access_token}` },
            })
            if (res.ok) {
              const apiMsgs = await res.json()
              if (Array.isArray(apiMsgs) && apiMsgs.length > 0) {
                const existing = updated[ch.id] ?? []
                const existingIds = new Set(existing.map((m) => m.id))
                const merged = [...existing]
                for (const m of apiMsgs) {
                  if (!existingIds.has(m.id)) {
                    merged.push(m)
                    existingIds.add(m.id)
                  }
                }
                merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                updated[ch.id] = merged
                hasNew = true
              }
            }
          } catch {
            // Ignore channel history error
          }
        }

        if (active && hasNew) {
          client.connection.setMessages(updated)
        }
      } catch {
        // Ignore general fetch error
      }
    }

    fetchHistory()
    return () => {
      active = false
    }
  }, [client, session, channels, isMock])

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
