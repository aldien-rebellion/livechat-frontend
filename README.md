# livechat-frontend

เว็บแอปพลิเคชัน Real-Time Live Chat Platform ฝั่งหน้าบ้าน (Client UI) พัฒนาด้วย React + Vite + TypeScript และ Tailwind CSS

## ติดตั้งและใช้งาน Frontend — Frontend #2

ใช้ Node.js **20.19 ขึ้นไปในสาย 20** เพื่อให้ตรงกับ Docker และ CI ของทีม
หรือ Node.js 22.13 ขึ้นไปในสาย 22 / Node.js 24 ขึ้นไป พร้อม npm
โดยใช้ `package-lock.json` สำหรับติดตั้ง dependencies ชุดเดียวกัน

รันจากโฟลเดอร์ `livechat-frontend`:

```powershell
npm ci
npm run dev
```

เปิด URL ที่ Vite แสดงใน terminal (โดยปกติ `http://localhost:5173`)
หน้าเริ่มต้นแสดง Sidebar ของ Issue #4 และ Chat UI ของ Issue #5
รันได้โดยไม่ต้องเปิด Backend โดยใช้ Mock Data แยกจาก UI

| คำสั่ง | การใช้งาน |
|---|---|
| `npm run dev` | เปิด Vite development server พร้อม HMR |
| `npx tsc --noEmit` | ตรวจ TypeScript ใน `src/` และ `vite.config.ts` |
| `npm run lint` | ตรวจ ESLint โดยไม่ยอมให้มี warnings |
| `npm run build` | ตรวจ TypeScript และสร้าง production assets ใน `dist/` |
| `npm run preview` | เปิดดู production build หลังรัน build (โดยปกติพอร์ต 4173) |

### โครงสร้างเริ่มต้น

```text
src/
├── components/   # พื้นที่สำหรับ reusable UI ใน issue ถัดไป
├── contexts/     # พื้นที่สำหรับ React contexts
├── hooks/        # พื้นที่สำหรับ custom hooks
├── pages/        # พื้นที่สำหรับหน้าจอ
├── services/     # พื้นที่สำหรับ API และ transport
├── App.tsx       # แสดงหน้า Workspace ของ Issue #4
├── main.tsx      # React entry point
└── index.css     # Tailwind directives
```

Tailwind CSS ใช้สาย **3.4** ผ่าน PostCSS และ `tailwind.config.js` ตาม Blueprint
ติดตั้ง `lucide-react`, `axios` และ `react-router-dom` ไว้แล้วตาม Issue #2
ส่วน Auth, WebSocket และ Search จะพัฒนาใน Issue #3, #6 และ #7

Production ใช้ base path `/` และผลลัพธ์ `dist/` ตาม Dockerfile เดิม
เมื่อเชื่อม Backend ใน issue ถัดไป ให้ใช้ `/api/v1` และ `/ws` ผ่าน Nginx ของระบบ
Frontend container เดี่ยวและ Vite server ในขั้น setup นี้เสิร์ฟเฉพาะหน้าเว็บ

---

## Sidebar และ Workspace / Channel List — Frontend #4

- `src/components/Sidebar.tsx` ประกอบ WorkspaceList และ ChannelList โดยรับข้อมูลและ callback ผ่าน props
- `src/pages/Workspace.tsx` เก็บ channels และ selection (`workspaceId`, `channelId`) ใน React State เพื่อส่งให้ ChatArea ใน Issue #5 ต่อไป
- `src/types/workspace.ts` กำหนด UI types ตามฟิลด์ในแผน ไม่ใช่ API response contract ที่ยืนยันแล้ว
- `src/services/mockWorkspaceData.ts` มี 3 Workspace; New Workspace ไม่มี Channel สำหรับทดสอบ empty state
- เลือก Workspace แล้วเลือก Channel แรกโดยอัตโนมัติ ถ้าไม่มีให้ selection เป็น `null`; การเลือก Workspace เดิมคง Channel ปัจจุบัน
- New channel เปิดฟอร์ม กรอกชื่อ 1–50 ตัว (a–z, 0–9, ขีดกลางคั่นคำ); trim และแปลงเป็นตัวพิมพ์เล็ก ป้องกันชื่อซ้ำใน Workspace เดียวกัน
- สร้าง Channel สาธารณะจำลองและเลือกทันที เก็บเฉพาะใน State จน reload ไม่มี API, localStorage หรือ WebSocket
- ตั้งแต่ 768px แสดง Sidebar ค้าง; ต่ำกว่า 768px ใช้ modal drawer พร้อม focus trap ของ native dialog, Escape, ปุ่มปิด และกดพื้นที่นอกแผงเพื่อปิด การเลือก Channel จะปิดแผง
- ใช้ Tab / Shift+Tab, Enter / Space กับปุ่ม; Enter ส่งฟอร์ม และ Escape ยกเลิกฟอร์มก่อนปิด drawer
- เนื้อหาด้านขวาเชื่อมต่อ ChatArea ของ Issue #5 ผ่าน selection เดิม

### ตรวจสอบด้วยตนเอง

1. รัน `npm ci`, `npx tsc --noEmit`, `npm run lint`, `npm run build`
2. รัน `npm run dev` เลือก Design Studio และ inspiration ตรวจชื่อและสถานะที่เลือก
3. เลือก New Workspace ตรวจข้อความไม่มี Channel แล้วสร้าง `project-updates` ตรวจรายการและ selection
4. ลองชื่อซ้ำ ชื่อว่าง และชื่อที่มีอักขระไม่รองรับ; Cancel / Escape ต้องไม่สร้าง Channel
5. สลับ Workspace กลับมา Channel จำลองยังอยู่; reload แล้วข้อมูลต้องกลับเป็นค่าเริ่มต้น
6. ตรวจที่ 375px, 768px และ 1280px รวมชื่อยาว การเลื่อนรายการ คีย์บอร์ด และเปิด/ปิด drawer

---

## Chat UI — Frontend #5

- `ChatArea.tsx` รับ Channel, messages, currentUserId และ onSend ผ่าน props เพื่อเปลี่ยนแหล่งข้อมูลภายหลังได้
- `MessageItem.tsx` แสดง Avatar ตัวอักษรย่อ ชื่อ เวลาใน timezone ของ Browser และข้อความที่คงการขึ้นบรรทัดใหม่
- `MessageInput.tsx` ส่ง callback ด้วย Enter หรือปุ่ม Send; Shift+Enter ขึ้นบรรทัดใหม่ และไม่ส่งระหว่าง IME composition
- ข้อความว่างหรือมีเฉพาะ whitespace ส่งไม่ได้; ข้อความแสดงเป็น plain text
- `services/mockMessageData.ts` แยกข้อมูลจำลองและผู้ใช้ตัวอย่างจาก UI; `types/message.ts` เป็น UI model ยังไม่ใช่ API contract
- `Workspace.tsx` เก็บข้อความแยกตาม Channel ID ใน State โดยใช้ workspace/channel selection เดิม ห้องใหม่เริ่มด้วยข้อความว่าง
- เปลี่ยน Channel แล้วล้าง draft และเริ่มที่ข้อความล่าสุด; ข้อความที่ส่งแล้วยังอยู่เมื่อสลับห้องกลับมา จน reload
- ประวัติเลื่อนแยกจาก composer; มี Jump to latest เมื่อเลื่อนขึ้น และเลื่อนลงเมื่อส่งข้อความ
- ไม่มี API, WebSocket, Auth หรือ Search ใน Issue นี้ และไม่ใช้ localStorage

### ตรวจสอบ Chat UI ด้วยตนเอง

1. เปิด general ตรวจประวัติ Avatar ชื่อ เวลา และเลื่อนอ่านข้อความก่อนหน้า
2. ส่งด้วย Enter และปุ่ม Send; ทดสอบ Shift+Enter, ข้อความภาษาไทย และข้อความว่าง
3. สลับ frontend แล้วกลับ general ตรวจว่าข้อความแยกห้องและ draft ไม่ข้ามห้อง
4. เปิด team-planning หรือ inspiration ตรวจ empty state และลองส่งข้อความแรก
5. สลับ Design Studio / New Workspace และสร้าง Channel ใหม่ ตรวจ selection และข้อความ
6. ตรวจที่ 375px, 768px, 1280px รวม drawer, composer, ข้อความยาว และ Browser Console
7. Reload ตรวจว่าข้อมูลกลับเป็น mock เริ่มต้น

---

## Frontend Container — Frontend #1

Dockerfile และการตั้งค่าเว็บเซิร์ฟเวอร์ Nginx สำหรับแพ็กเกจและเสิร์ฟไฟล์ Static Web Application ในรูปแบบ Production Container

### สถาปัตยกรรมของ Container (Multi-stage Build)

1. **Stage 1 (`builder`):**
   * Base image: `node:20-alpine`
   * ติดตั้ง Dependencies ด้วย `npm install`
   * บิลด์ไฟล์ Production Asset ด้วย `npm run build` ได้ผลลัพธ์เป็น Static Bundle อยู่ในโฟลเดอร์ `/app/dist`
2. **Stage 2 (`runtime`):**
   * Base image: `nginx:alpine`
   * คัดลอกเฉพาะโฟลเดอร์ `/app/dist` จาก builder stage ไปไว้ที่ `/usr/share/nginx/html`
   * คัดลอกไฟล์คอนฟิก [`nginx.conf`](nginx.conf) เพื่อรองรับ:
     * **SPA Fallback Routing:** รองรับ React Router เมื่อผู้ใช้ Refresh หรือเข้า URL ลึกๆ ด้วยคำสั่ง `try_files $uri $uri/ /index.html;` (ไม่เกิด 404 Not Found)
     * **Gzip Compression:** บีบอัดไฟล์ HTML, JS, CSS ก่อนส่งไปยัง Browser
     * **Asset Caching:** แคชไฟล์ Static (Images, Fonts, CSS, JS) เพื่อลดภาระการโหลด
     * **Healthcheck:** ตรวจสอบความพร้อมการทำงานของ Nginx บนพอร์ต 80

### ขอบเขตงานและความสัมพันธ์กับ Frontend #2

* **Frontend #1 (Issue นี้):** จัดเตรียม Dockerfile, Nginx config, `.dockerignore`, `.gitignore` เพื่อวางรากฐาน Infrastructure ฝั่งหน้าบ้าน
* **Frontend #2:** เพิ่มโครงสร้าง React + Vite (`package.json`, `vite.config.ts`, `src/`) พร้อม scripts สำหรับ build และตรวจสอบคุณภาพโค้ด
* เมื่อ Frontend #2 ดำเนินการเสร็จสิ้น Dockerfile จะสามารถสั่งบิลด์ Image ได้ทันที:

```powershell
# บิลด์ Docker Image ของ Frontend
docker build -t livechat-frontend:local .

# ทดสอบรัน Container เดี่ยว
docker run --rm -p 80:80 livechat-frontend:local
```

### การรันผ่าน Docker Compose

เมื่อรันร่วมกับระบบหลังบ้านผ่าน `docker-compose.yml` (ในโฟลเดอร์ backend repository):

```powershell
$env:FRONTEND_CONTEXT = '../livechat-frontend'
docker compose --profile app up -d --build frontend
```

กำหนด `FRONTEND_CONTEXT` ให้ตรงกับตำแหน่ง checkout จริง เพราะค่าเริ่มต้นใน Compose คือ
`../livechat frontend` โดยคำสั่งข้างต้นตั้งค่าเฉพาะ shell ปัจจุบัน ไม่แก้ไฟล์ Backend
การเปิดระบบครบชุดผ่าน Nginx ยังต้องรอ Backend #10 พร้อมใช้งาน

---

## CI Pipeline — Frontend #8

GitHub Actions workflow อยู่ที่ [`.github/workflows/ci.yml`](.github/workflows/ci.yml) รันอัตโนมัติบนทุก Pull Request และ Push เข้า branch `main` (อ้างอิง Workshop 11 กิจกรรมที่ 1):
1. **Type Checking:** ตรวจสอบความถูกต้องของ TypeScript ด้วย `npx tsc --noEmit`
2. **Linting:** ตรวจสอบ Code Style และ Syntax ด้วย `npm run lint` (ESLint)
3. **Build Smoke Test:** ทดสอบว่าบันเดิล Production ผ่านจริงด้วย `npm run build` ป้องกันไม่ให้โค้ดพังถูก Merge เข้าสู่ `main`

### การรันตรวจสอบบนเครื่อง Local

```powershell
# ติดตั้ง dependencies
npm ci

# ตรวจสอบ Types และ Lint
npx tsc --noEmit
npm run lint

# ทดสอบ Build
npm run build
```
