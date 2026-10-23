import type { Message } from './message'
import type { Channel } from './workspace'

// UI contract only. Backend response envelope/author fields are not yet specified.
export interface SearchRequest {
  workspaceId: string
  channel: Channel
  query: string
  signal: AbortSignal
}

export interface SearchService {
  search(request: SearchRequest): Promise<Message[]>
}
