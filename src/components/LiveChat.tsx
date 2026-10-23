import { useAuth } from '../hooks/useAuth'
import { useWebSocket } from '../hooks/useWebSocket'
import type { Channel } from '../types/workspace'
import ChatArea from './ChatArea'

export default function LiveChat({ channel }: { channel: Channel }) {
  const { session } = useAuth()
  const socket = useWebSocket()
  const connected = socket.state === 'connected'
  const names = Object.values(socket.typing[channel.id] ?? {})
  return <>
    <div className="border-b border-slate-800 px-4 py-2 text-sm sm:px-8">
      <p role="status">{socket.mock ? `Mock WebSocket · ${socket.state}` : 'Disconnected · Backend integration pending'}</p>
      {!socket.mock && <p className="mt-1 text-xs text-amber-200">การเชื่อมต่อ Backend ยังไม่พร้อมใช้งาน ขณะนี้ Workspace และ Channel เป็นข้อมูลตัวอย่าง</p>}
      {socket.error && <p role="alert" className="mt-1 text-amber-200">{socket.error}</p>}
      {socket.mock && <details className="mt-2 text-xs text-slate-400"><summary className="cursor-pointer">Mock test controls (no Backend)</summary><div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={!connected} onClick={socket.simulateDisconnect} className="rounded border border-slate-600 p-2 disabled:opacity-40">Disconnect mock</button>
        <button type="button" disabled={!connected} onClick={() => socket.simulatePeer?.(channel.id, false)} className="rounded border border-slate-600 p-2 disabled:opacity-40">Receive mock message</button>
        <button type="button" disabled={!connected} onClick={() => socket.simulatePeer?.(channel.id, true)} className="rounded border border-slate-600 p-2 disabled:opacity-40">Receive mock typing</button>
      </div></details>}
    </div>
    <ChatArea channel={channel} messages={socket.messages[channel.id] ?? []} currentUserId={session?.user.id ?? ''}
      disabled={!connected} typingNames={names} mock={socket.mock ?? false}
      onTyping={() => socket.connection?.sendTyping(channel.workspace_id, channel.id)}
      onSend={(content) => socket.connection?.sendMessage(channel.workspace_id, channel.id, content) ?? false} />
  </>
}
