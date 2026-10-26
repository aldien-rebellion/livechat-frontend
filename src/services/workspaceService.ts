import type { AxiosInstance } from 'axios'
import type { Workspace } from '../types/workspace'

function decodeWorkspace(value: unknown): Workspace {
  if (!value || typeof value !== 'object') throw new Error('Invalid workspace response.')
  const workspace = value as Partial<Workspace>
  if (typeof workspace.id !== 'string' || !workspace.id || typeof workspace.name !== 'string' ||
      !workspace.name || typeof workspace.slug !== 'string' || typeof workspace.can_manage !== 'boolean') {
    throw new Error('Invalid workspace response.')
  }
  return workspace as Workspace
}

export function createWorkspaceService(api: Pick<AxiosInstance, 'get' | 'post' | 'delete'>) {
  return {
    async list(signal: AbortSignal): Promise<Workspace[]> {
      const { data } = await api.get<unknown>('/workspaces', { signal })
      if (!Array.isArray(data)) throw new Error('Invalid workspace response.')
      return data.map(decodeWorkspace)
    },
    async create(name: string): Promise<Workspace> {
      const { data } = await api.post<unknown>('/workspaces', { name })
      return decodeWorkspace(data)
    },
    async remove(workspaceId: string): Promise<void> {
      await api.delete(`/workspaces/${encodeURIComponent(workspaceId)}`)
    },
  }
}
