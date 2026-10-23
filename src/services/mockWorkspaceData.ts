import type { Channel, Workspace } from '../types/workspace'

// Local examples only; these are not API responses or permission checks.
export const mockWorkspaces: Workspace[] = [
  { id: 'team', name: 'Live Chat Team', slug: 'live-chat-team' },
  { id: 'design', name: 'Design Studio', slug: 'design-studio' },
  { id: 'new', name: 'New Workspace', slug: 'new-workspace' },
]

export const mockChannels: Channel[] = [
  { id: 'general', workspace_id: 'team', name: 'general', is_private: false },
  { id: 'frontend', workspace_id: 'team', name: 'frontend', is_private: false },
  { id: 'planning', workspace_id: 'team', name: 'team-planning', is_private: true },
  { id: 'reviews', workspace_id: 'design', name: 'design-reviews', is_private: false },
  { id: 'inspiration', workspace_id: 'design', name: 'inspiration', is_private: false },
]
