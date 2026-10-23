export interface Workspace {
  id: string
  name: string
  slug: string
}

export interface Channel {
  id: string
  workspace_id: string
  name: string
  is_private: boolean
}

export interface WorkspaceSelection {
  workspaceId: string | null
  channelId: string | null
}
