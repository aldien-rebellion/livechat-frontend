import type { Message } from './message'
import type { Channel } from './workspace'

// Search uses the selected channel and the shared authenticated API client.
export interface SearchRequest {
  workspaceId: string
  channel: Channel
  query: string
  signal: AbortSignal
}

export interface SearchService {
  search(request: SearchRequest): Promise<Message[]>
}
