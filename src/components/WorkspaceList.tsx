import { Check, Layers3 } from 'lucide-react'
import type { Workspace } from '../types/workspace'

interface WorkspaceListProps {
  workspaces: Workspace[]
  selectedWorkspaceId: string | null
  onSelectWorkspace: (workspaceId: string) => void
}

export default function WorkspaceList({ workspaces, selectedWorkspaceId, onSelectWorkspace }: WorkspaceListProps) {
  return (
    <nav aria-label="Workspaces" className="space-y-1">
      <h2 className="px-3 pb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Workspaces</h2>
      {workspaces.length === 0 && <p className="px-3 text-sm text-slate-400">No workspaces available.</p>}
      {workspaces.map((workspace) => {
        const selected = workspace.id === selectedWorkspaceId
        return (
          <button key={workspace.id} type="button" aria-pressed={selected} onClick={() => onSelectWorkspace(workspace.id)} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 ${selected ? 'bg-teal-400/10 font-semibold text-teal-200 ring-1 ring-inset ring-teal-400/30' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
            <Layers3 aria-hidden="true" className="h-5 w-5 shrink-0" />
            <span className="min-w-0 flex-1 break-words">{workspace.name}</span>
            {selected && <Check aria-hidden="true" className="h-4 w-4 shrink-0" />}
          </button>
        )
      })}
    </nav>
  )
}
