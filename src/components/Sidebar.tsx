import { MessageCircle } from "lucide-react";
import type { Channel, Workspace } from "../types/workspace";
import ChannelList from "./ChannelList";
import WorkspaceList from "./WorkspaceList";

interface SidebarProps {
  workspaces: Workspace[];
  channels: Channel[];
  selectedWorkspaceId: string | null;
  selectedChannelId: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
  onSelectChannel: (channelId: string) => void;
  onCreateChannel: (name: string) => void | Promise<void>;
  mock?: boolean;
  canManage?: boolean;
  onCreateWorkspace?: () => void;
  onDeleteWorkspace?: (workspace: Workspace) => void;
  onDeleteChannel?: (channel: Channel) => void;
}

export default function Sidebar(props: SidebarProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-900 text-slate-100">
      <div className="flex items-center gap-3 border-b border-slate-800 px-6 py-6">
        <span className="rounded-xl bg-teal-300 p-2 text-slate-950">
          <MessageCircle aria-hidden="true" className="h-5 w-5" />
        </span>
        <span className="text-lg font-bold tracking-tight">
          Live Chats
          <span className="block text-xs font-normal tracking-normal text-slate-400">
            Your team, connected.
          </span>
        </span>
      </div>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
        <WorkspaceList
          workspaces={props.workspaces}
          selectedWorkspaceId={props.selectedWorkspaceId}
          onSelectWorkspace={props.onSelectWorkspace}
          onCreateWorkspace={props.onCreateWorkspace}
          onDeleteWorkspace={props.onDeleteWorkspace}
        />
        <div className="border-t border-slate-800" />
        {props.selectedWorkspaceId ? (
          <ChannelList
            key={props.selectedWorkspaceId}
            channels={props.channels}
            selectedChannelId={props.selectedChannelId}
            onSelectChannel={props.onSelectChannel}
            onCreateChannel={props.onCreateChannel}
            mock={props.mock}
            canManage={props.canManage}
            onDeleteChannel={props.onDeleteChannel}
          />
        ) : (
          <p className="px-3 text-sm text-slate-400">
            Select a workspace to view channels.
          </p>
        )}
      </div>
      <p className="border-t border-slate-800 px-6 py-4 text-xs leading-relaxed text-slate-400">
        <span className="font-semibold text-teal-300">Live Chat Platform</span>
        <br />
        Real-time WebSocket &amp; Redis Pub/Sub
      </p>
    </div>
  );
}
