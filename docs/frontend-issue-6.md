# Frontend Issue #6 — Implementation and verification

วันที่ตรวจ: 23 ตุลาคม 2026 (Asia/Bangkok), Node 24.19.0 / npm 11.17.0

## ตรวจสอบก่อนเริ่ม

- Branch `feat/6-websocket`, working tree เริ่มต้นสะอาด
- อ่าน README และ plan ทั้งสอง repo (Markdown, metadata และ diagram; plan ทั้งสองชุดมี SHA256 ตรงกัน)
- อ่าน Chat UI #5, Workspace/Sidebar #4 และ Auth Context/client #3
- Backend checkout มี infra/tests แต่ยังไม่มี `app/` และ endpoint `/ws`
- แก้เฉพาะ Frontend #6 ไม่มี Search #7, Backend, commit, push หรือ PR

## ข้อตกลงที่มีในเอกสาร

| เรื่อง | แหล่งอ้างอิง |
|---|---|
| `/ws?token=<access_token>` | Issue Specifications: Shared Contracts, BE #12, FE #6 |
| หนึ่ง connection ใช้หลาย channel | Blueprint §3.1 |
| `subscribe` พร้อม `channel_id` | Blueprint §3.1 (ไม่ปรากฏในรายการ actions ของ BE #12) |
| `send_message` + `channel_id`, `content` | Blueprint §3.1 / BE #12 |
| `typing` + `channel_id`, `heartbeat` | Blueprint §3.1 / BE #12 |
| ชื่อ broadcasts `new_message`, `user_typing`, `presence_update` | BE #13 |
| Redis `pubsub:channel:{channel_id}` | BE #13 / Blueprint §3.1 |
| Refresh access token แล้ว reconnect พร้อม backoff | Blueprint §3.3 |

ไม่ได้เพิ่ม read receipt/presence UI ซึ่งไม่อยู่ในขอบเขตงานนี้

## ความสามารถและการออกแบบ

- `ChatConnection` เป็น external store ให้ Context/useWebSocket อ่านด้วย `useSyncExternalStore`
- connection เดียวต่อ workspace ที่เลือก, subscribe ทุก channel ใน workspace; เปลี่ยน channel ไม่เปิด socket ใหม่
- เปลี่ยน workspace ปิด socket เก่าและเปิดใหม่เพื่อไม่ค้าง subscriptions ข้าม workspace เพราะยังไม่มี unsubscribe contract
- channels ที่เพิ่มเข้ามาจะ subscribe บน socket เดิม; ถ้าสิทธิ์/channel ถูกถอดจะเปิด socket ใหม่
- ส่งเฉพาะ workspace/channel ที่อยู่ใน scope และ subscribe แล้ว; reject whitespace และ disconnected sends
- รับข้อความแยกตาม channel และ cache แยก workspace; ID ซ้ำใน channel เดียวกันแสดงครั้งเดียว
- ไม่มี optimistic message หรือการ replay หลัง reconnect เพราะยังไม่มี message acknowledgement/idempotency contract
- draft ล้างเมื่อ `socket.send` สำเร็จ ซึ่งไม่ใช่การยืนยันว่า server persist สำเร็จ; ส่งล้มเหลวคง draft และ reconnect
- connection timeout 10 วินาที; reconnect base 1 วินาทีแบบ exponential ถึง 30 วินาที บวก jitter ไม่เกิน 25%
- ส่ง heartbeat ทุก 25 วินาที (client policy ที่เลือกเองจาก TTL 60 วินาทีในแผน ไม่ใช่ interval contract จาก Backend)
- typing ส่งอย่างมากหนึ่งครั้งต่อ channel ทุก 1.5 วินาที; ป้ายรายผู้ใช้หมดอายุใน 3 วินาทีหรือเมื่อได้รับข้อความ
- ไม่ส่ง stop-typing frame ที่เอกสารไม่ได้ระบุ; local TTL เป็น UI policy
- token rotation จาก Auth session เปลี่ยน socket โดยใช้ token ล่าสุด; logout/unmount ล้าง socket, caches, timers
- callbacks เก่ามี generation guard; cleanup ยกเลิก retry/heartbeat/open-timeout/typing timers และ native handlers
- Auth client เปิด `refresh()` ตัวเดิมให้ WS ใช้ได้ โดยคง single-flight และ logout race protections ของ #3
- core รับ `isAuthClose`/`refresh` ผ่าน injection; ยังไม่กำหนดรหัส auth failure เองให้ Backend จริง
- Native adapter ใช้ token query ตามแผน, URL encoding, `/ws`, WSS เมื่อหน้าเป็น HTTPS, backpressure guard และ injectable inbound decoder
- Mock adapter ทำ local echo, BroadcastChannel ต่อ workspace, strict mock decoder และปุ่มจำลอง peer/disconnect
- Mock data และ controls ใช้เฉพาะ dev opt in; ไม่มี token จริง/secret ใน source หรือ browser storage
- ไม่ติดต่อ Redis จาก browser; transport boundary รองรับ event ที่ Backend fanout จาก Redis ภายหลัง

## จุดที่ต้องยืนยันกับ Backend Lead

1. JSON envelope/discriminator ของ server events และ payload ทุก field, sender/author shape และ timestamp format
2. workspace ถูกผูกกับ socket อย่างไร เมื่อ URL มีเพียง token; สิทธิ์สมาชิกและ private channel ถูกตรวจฝั่ง server อย่างไร
3. ยืนยัน `subscribe` จาก Blueprint, acknowledgement, readiness, rejection, unsubscribe และพฤติกรรมเมื่อเปลี่ยน workspace
4. auth-expired close/error codes, refresh/reconnect policy และการ revoke; browser handshake failure อาจเห็นเพียง 1006
5. server echo/ack, stable message ID, idempotency key และ replay/cursor/history backfill หลัง connection ขาด
6. heartbeat/pong/error frames, typing expiry/rate limits และความต่าง read_receipt ระหว่าง Blueprint กับ BE #12
7. Workspace/Channel API และ IDs จริงแทน mock ของ #4 รวม membership changes

`ChatEvent` เป็น internal normalized type และ mock envelope เป็นข้อตกลงทดสอบเท่านั้น **ไม่ใช่ Backend contract**
`createWebSocketAdapter` ต้องรับ decoder ที่ยืนยันแล้วและ endpoint (`/ws` ผ่าน Nginx หรือ `ws://localhost:8000/ws`)
ก่อนนำไปใช้กับ real provider; ไม่มี workspace query parameter หรือ auth frame ที่สมมติขึ้น

## ข้อจำกัดการเชื่อมต่อจริง

โหมด API ของหน้าแอปแสดง Disconnected / Backend integration pending และปิดส่งข้อความ
ยังไม่ wire native adapter เข้าหน้าแอป เพราะ inbound contract และ workspace/channel data จริงไม่พร้อม
ไม่ได้ส่ง mock IDs ไป endpoint จริง ไม่มี silent fallback จาก API ไป Mock
Mock transport ไม่ได้เปิด network WebSocket และไม่ได้ทดสอบ FastAPI, JWT signature, Redis Pub/Sub หรือ Nginx upgrade
การรับข้อความที่พลาดระหว่าง disconnect, delivery guarantee และ auth-expiry end-to-end ต้องทดสอบเมื่อ Backend พร้อม
เก็บ history เฉพาะ memory; reload/logout ล้างข้อมูล ไม่มี persistence หรือ history API ใน issue นี้

## ไฟล์ที่สร้าง

- `src/types/websocket.ts` — client frames, internal events และ transport interface
- `src/services/chatConnection.ts` — lifecycle, scope, messages, typing และ reconnect
- `src/services/webSocketAdapter.ts` — native `/ws` transport สำหรับ integration
- `src/services/mockWebSocketAdapter.ts` — dev/test adapter และ mock decoder
- `src/contexts/WebSocketContext.tsx` — provider ตาม Auth/Workspace
- `src/contexts/socketContext.ts` — context value แยกเพื่อรองรับ Fast Refresh
- `src/hooks/useWebSocket.ts` — subscription hook
- `src/components/LiveChat.tsx` — เชื่อม store กับ ChatArea และแสดงสถานะ
- `tests/websocket.test.mjs` — automated tests โดยใช้ TypeScript dependency เดิม
- `docs/frontend-issue-6.md` — รายงานนี้

## ไฟล์ที่แก้ไข

- `src/pages/Workspace.tsx` — provider, memoized scope และใช้ LiveChat แทน local send
- `src/components/ChatArea.tsx` — typing/status/composer props
- `src/components/MessageInput.tsx` — typing callback, disabled send และคง draft เมื่อส่งไม่สำเร็จ
- `src/services/authClient.ts` — export refresh ที่มีอยู่แล้วเพื่อให้ WS reuse
- `package.json` — test/test:websocket scripts (ไม่มี dependencies ใหม่)
- `.env.example` — opt-in dev Mock WS configuration
- `README.md` — วิธีใช้งานและลิงก์รายงาน

## ผลทดสอบ

| รายการ | ผล / ลักษณะการทดสอบ |
|---|---|
| `npm ci` | ผ่าน หลังหยุด Vite เดิมที่ lock esbuild.exe; lockfile ไม่เปลี่ยน |
| `npx tsc --noEmit` | ผ่าน |
| `npm run lint` | ผ่าน ไม่มี warnings |
| `npm run build` | ผ่าน; ตรวจว่า production bundle ไม่รวม Mock adapter |
| `npm test` | ผ่าน 27/27: Auth 10, WebSocket 17; Mock/fake native transport |
| Connection/timeout/reconnect/backoff/heartbeat | Automated fake timers + Mock Browser disconnect/reconnect |
| Send/receive/duplicate/scope | Automated + Browser; native transport ใช้ fake socket และ injected decoder |
| Typing throttle/self/expiry/message-clear | Automated + Browser แสดง “กำลังพิมพ์...” |
| Workspace/channel changes และ background channel | Automated + Browser; history แยกและกลับมาได้ |
| Cleanup/StrictMode/token rotation/logout/failed refresh | Automated; Browser Sign out แล้วกลับ Login/reload |
| สอง client และอีก workspace | Automated BroadcastChannel Mock; send, typing, workspace isolation |
| Login/Sidebar/Enter/Shift+Enter/ภาษาไทย | Browser Mock Register → Login, drawer, ส่งหลายบรรทัด |
| 375/768/1280px | Browser ไม่พบ horizontal overflow; ตรวจภาพมือถือและ desktop |
| Browser Console | ไม่พบ error/warning ระหว่าง flow ที่ทดสอบ |
| Git diff | ตรวจ diff และ `git diff --check`; ไม่มี whitespace errors |
| Backend/Redis จริง | **ยังไม่ได้ทดสอบ** ตามข้อจำกัดข้างต้น |

`npm ci` รายงาน dependency vulnerabilities 7 รายการ (2 moderate, 5 high) จาก dependency tree เดิม
ไม่รัน `npm audit fix` หรือเปลี่ยนเวอร์ชันนอก Issue #6

## Git status ตอนส่งตรวจ

Branch `feat/6-websocket`; 7 modified files และ 10 untracked/new files ตามรายการด้านบน
ยังไม่ stage, commit, push หรือสร้าง Pull Request และ Backend ไม่มีการแก้ไขจากงานนี้
