import type { Message } from '../types/message'
import type { SearchService } from '../types/search'

// Searches the active mock chat snapshot, including sent/received messages.
// Substring matching is a demo, not PostgreSQL English full-text ranking.
export function createMockSearchService(getMessages: () => Message[], delayMs = 300): SearchService {
  return { async search({ workspaceId, channel, query, signal }) {
    signal.throwIfAborted()
    if (!workspaceId || channel.workspace_id !== workspaceId) throw new Error('Invalid search scope.')
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return []
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(signal.reason) }
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, delayMs)
      signal.addEventListener('abort', abort, { once: true })
    })
    signal.throwIfAborted()
    return getMessages().filter((message) => message.channel_id === channel.id && message.content.toLocaleLowerCase().includes(normalized))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 30)
  } }
}
