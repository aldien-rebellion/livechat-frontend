import type { AxiosInstance } from 'axios'
import type { Message } from '../types/message'
import type { SearchRequest, SearchService } from '../types/search'

function queryFor(request: SearchRequest) {
  if (!request.workspaceId || request.channel.workspace_id !== request.workspaceId) {
    throw new Error('Search channel does not belong to this workspace.')
  }
  return request.query.trim()
}

export function decodeSearchMessages(data: unknown): Message[] {
  if (!Array.isArray(data)) throw new Error('Invalid search response.')
  return data.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('Invalid search message.')
    const message = value as Record<string, unknown>
    for (const key of ['id', 'channel_id', 'user_id', 'content', 'created_at']) {
      if (typeof message[key] !== 'string') throw new Error('Invalid search message.')
    }
    if (!message.id || !message.channel_id || !message.user_id || !Number.isFinite(Date.parse(message.created_at as string))) {
      throw new Error('Invalid search message.')
    }
    const author = message.author as Record<string, unknown> | undefined
    const userId = message.user_id as string
    return {
      id: message.id as string, channel_id: message.channel_id as string, user_id: userId,
      content: message.content as string, created_at: message.created_at as string,
      author: { id: userId, full_name: typeof author?.full_name === 'string' && author.full_name ? author.full_name : userId },
    }
  })
}

export function createApiSearchService(api: AxiosInstance, decode: (data: unknown) => Message[] = decodeSearchMessages): SearchService {
  return { async search(request) {
    const query = queryFor(request)
    request.signal.throwIfAborted()
    if (!query) return []
    const response = await api.get<unknown>(`/channels/${encodeURIComponent(request.channel.id)}/search`, {
      params: { q: query }, signal: request.signal,
    })
    request.signal.throwIfAborted()
    const messages = decode(response.data)
    if (messages.some((message) => message.channel_id !== request.channel.id)) {
      throw new Error('Search returned messages outside the selected channel.')
    }
    return messages.slice(0, 30)
  } }
}
