import type { AuthSession } from '../types/auth'
import type { ChannelMessages } from '../types/message'
import type { Channel } from '../types/workspace'
import type { ChatEvent, ChatSocket, ClientFrame, ConnectionState, SocketFactory } from '../types/websocket'

interface Snapshot {
  state: ConnectionState
  messages: ChannelMessages
  typing: Record<string, Record<string, string>>
  error: string | null
}
interface Scope { session: AuthSession; workspaceId: string; channels: Channel[] }

// Owns one socket for all channels in the selected workspace, independent of React.
export class ChatConnection {
  private snapshot: Snapshot = { state: 'disconnected', messages: {}, typing: {}, error: null }
  private listeners = new Set<() => void>()
  private socket: ChatSocket | null = null
  private scope: Scope | null = null
  private generation = 0
  private retry: ReturnType<typeof setTimeout> | undefined
  private opening: ReturnType<typeof setTimeout> | undefined
  private heartbeat: ReturnType<typeof setInterval> | undefined
  private typingTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private lastTyping = new Map<string, number>()
  private subscribed = new Set<string>()
  private attempts = 0
  private transportFailed: (() => void) | undefined
  private workspaceMessages = new Map<string, ChannelMessages>()

  constructor(private factory: SocketFactory, private options: {
    retryMs?: number
    random?: () => number
    typingMs?: number
    refresh?: () => Promise<unknown>
    isAuthClose?: (code: number) => boolean
    initialMessages?: (channels: Channel[]) => ChannelMessages
  } = {}) {}

  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }

  setMessages(messages: ChannelMessages) {
    this.update({ messages: { ...this.snapshot.messages, ...messages } })
  }

  private update(value: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...value }
    this.listeners.forEach((listener) => listener())
  }
  private clearConnection() {
    this.generation++
    clearTimeout(this.retry)
    clearTimeout(this.opening)
    clearInterval(this.heartbeat)
    this.typingTimers.forEach(clearTimeout)
    this.typingTimers.clear()
    this.lastTyping.clear()
    this.subscribed.clear()
    this.transportFailed = undefined
    const socket = this.socket
    this.socket = null
    socket?.close()
  }
  setScope(scope: Scope | null) {
    if (scope && this.scope && scope.workspaceId === this.scope.workspaceId && scope.session === this.scope.session) {
      const removed = this.scope.channels.some((old) => !scope.channels.some((next) => next.id === old.id && next.workspace_id === old.workspace_id))
      this.scope = scope
      // There is no documented unsubscribe: reconnect if access is removed.
      if (removed) { this.clearConnection(); this.connect() }
      else if (this.snapshot.state === 'connected') this.subscribeChannels()
      return
    }
    const sameUser = scope && this.scope?.session.user.id === scope.session.user.id
    const sameWorkspace = sameUser && this.scope?.workspaceId === scope.workspaceId
    if (sameUser && this.scope) this.workspaceMessages.set(this.scope.workspaceId, this.snapshot.messages)
    if (!sameUser) this.workspaceMessages.clear()
    this.clearConnection()
    this.scope = scope
    this.attempts = 0
    const messages = scope ? this.workspaceMessages.get(scope.workspaceId) ?? this.options.initialMessages?.(scope.channels) ?? {} : {}
    this.update({ state: 'disconnected', messages: sameWorkspace ? this.snapshot.messages : messages, typing: {}, error: null })
    if (scope) this.connect()
  }
  private connect() {
    const scope = this.scope
    if (!scope) return
    const generation = ++this.generation
    const active = () => this.generation === generation
    this.update({ state: 'connecting', error: null })
    const closed = (code: number) => {
      if (!active()) return
      this.clearConnection()
      const revision = this.generation
      this.update({ state: 'disconnected', typing: {}, error: 'Connection lost. Reconnecting…' })
      if (this.options.isAuthClose?.(code)) {
        if (!this.options.refresh) { this.update({ error: 'Please sign in again.' }); return }
        // Auth store publishes the new session, which opens a socket with its new token.
        void this.options.refresh().catch(() => {
          if (revision === this.generation) this.update({ error: 'Please sign in again.' })
        })
        return
      }
      const delay = Math.min((this.options.retryMs ?? 1000) * 2 ** Math.min(this.attempts++, 5), 30000)
      this.retry = setTimeout(() => { if (revision === this.generation) this.connect() }, delay * (1 + (this.options.random ?? Math.random)() * 0.25))
    }
    this.transportFailed = () => closed(1006)
    try {
      this.socket = this.factory(scope.session, scope.workspaceId, {
        open: () => {
          if (!active()) return
          clearTimeout(this.opening)
          this.attempts = 0
          this.update({ state: 'connected', error: null })
          this.subscribeChannels()
          if (!active()) return
          this.heartbeat = setInterval(() => { if (active()) this.write({ action: 'heartbeat' }) }, 25000)
        },
        event: (event) => { if (active()) this.receive(event) },
        close: closed,
      })
      this.opening = setTimeout(() => closed(1006), 10000)
    } catch { closed(1006) }
  }
  private write(frame: ClientFrame) {
    if (this.snapshot.state !== 'connected' || !this.socket) return false
    try { this.socket.send(frame); return true }
    catch {
      this.transportFailed?.()
      this.update({ error: 'Message was not sent. Check the connection and try again.' })
      return false
    }
  }
  private subscribeChannels() {
    for (const channel of this.scope?.channels ?? []) {
      if (channel.workspace_id !== this.scope?.workspaceId || this.subscribed.has(channel.id)) continue
      if (this.write({ action: 'subscribe', channel_id: channel.id })) this.subscribed.add(channel.id)
    }
  }
  sendMessage(workspaceId: string, channelId: string, content: string) {
    if (workspaceId !== this.scope?.workspaceId || !content.trim()) return false
    const channelValid = this.scope?.channels.some((channel) => channel.id === channelId && channel.workspace_id === this.scope?.workspaceId)
    if (!channelValid) return false
    if (!this.subscribed.has(channelId)) {
      if (this.write({ action: 'subscribe', channel_id: channelId })) this.subscribed.add(channelId)
    }
    return this.write({ action: 'send_message', channel_id: channelId, content: content.trim() })
  }
  sendTyping(workspaceId: string, channelId: string) {
    if (workspaceId !== this.scope?.workspaceId) return
    const channelValid = this.scope?.channels.some((channel) => channel.id === channelId && channel.workspace_id === this.scope?.workspaceId)
    if (!channelValid) return
    if (!this.subscribed.has(channelId)) {
      if (this.write({ action: 'subscribe', channel_id: channelId })) this.subscribed.add(channelId)
    }
    const now = Date.now()
    if (now - (this.lastTyping.get(channelId) ?? 0) < 1500) return
    if (this.write({ action: 'typing', channel_id: channelId })) this.lastTyping.set(channelId, now)
  }
  private receive(event: ChatEvent) {
    if (event.workspaceId !== this.scope?.workspaceId) return
    const channelId = event.type === 'new_message' ? event.message.channel_id : event.channelId
    const channelValid = this.scope?.channels.some((channel) => channel.id === channelId && channel.workspace_id === this.scope?.workspaceId)
    if (!channelValid) return
    this.subscribed.add(channelId)
    if (event.type === 'new_message') {
      const messages = this.snapshot.messages[channelId] ?? []
      if (messages.some((message) => message.id === event.message.id)) return
      this.clearTyping(channelId, event.message.user_id)
      this.update({ messages: { ...this.snapshot.messages, [channelId]: [...messages, event.message] } })
    } else if (event.userId !== this.scope?.session.user.id) {
      const key = JSON.stringify([channelId, event.userId])
      clearTimeout(this.typingTimers.get(key))
      this.update({ typing: { ...this.snapshot.typing, [channelId]: { ...this.snapshot.typing[channelId], [event.userId]: event.name } } })
      this.typingTimers.set(key, setTimeout(() => this.clearTyping(channelId, event.userId), this.options.typingMs ?? 3000))
    }
  }
  private clearTyping(channelId: string, userId: string) {
    const key = JSON.stringify([channelId, userId])
    clearTimeout(this.typingTimers.get(key))
    this.typingTimers.delete(key)
    const users = { ...this.snapshot.typing[channelId] }
    delete users[userId]
    this.update({ typing: { ...this.snapshot.typing, [channelId]: users } })
  }
  dispose() { this.setScope(null) }
}
