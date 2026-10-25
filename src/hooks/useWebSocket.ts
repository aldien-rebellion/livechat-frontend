import { useContext, useSyncExternalStore } from 'react'
import { WebSocketContext } from '../contexts/socketContext'

const unavailable = { state: 'disconnected' as const, messages: {}, typing: {}, error: null }
const noopSubscribe = () => () => {}
const getUnavailable = () => unavailable

export function useWebSocket() {
  const context = useContext(WebSocketContext)
  const snapshot = useSyncExternalStore(context?.connection.subscribe ?? noopSubscribe, context?.connection.getSnapshot ?? getUnavailable)
  return { ...snapshot, ...context }
}
