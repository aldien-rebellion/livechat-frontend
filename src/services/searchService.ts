import type { AxiosInstance } from 'axios'
import type { Message } from '../types/message'
import type { SearchRequest, SearchService } from '../types/search'

function queryFor(request: SearchRequest) {
  if (!request.workspaceId || request.channel.workspace_id !== request.workspaceId) {
    throw new Error('Search channel does not belong to this workspace.')
  }
  return request.query.trim()
}

// Planned endpoint; inject authService.api and a confirmed response decoder when
// real workspace/channel IDs, authorization and history loading are integrated.
// Never assume an undocumented Backend response envelope or send demo IDs.
export function createApiSearchService(api: AxiosInstance, decode: (data: unknown) => Message[]): SearchService {
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
