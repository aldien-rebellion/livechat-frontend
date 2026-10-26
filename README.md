# Real-Time Live Chat Platform — Frontend Client

เว็บแอปพลิเคชัน Single Page Application (SPA) ฝั่งหน้าบ้านของแพลตฟอร์มแชทเรียลไทม์ (Real-Time Live Chat Platform) พัฒนาด้วย **React 19**, **TypeScript**, **Vite** และ **Tailwind CSS 3.4** เชื่อมต่อกับ Backend Microservices ผ่าน REST API และ WebSocket พร้อมระบบการจัดการเซสชันแบบ Dual-Token JWT ที่ปลอดภัย

---

## สารบัญ
1. [ฟีเจอร์หลักของระบบ (Key Features)](#1-ฟีเจอร์หลักของระบบ-key-features)
2. [เทคโนโลยีและเครื่องมือที่ใช้ (Tech Stack)](#2-เทคโนโลยีและเครื่องมือที่ใช้-tech-stack)
3. [โครงสร้างโปรเจกต์ (Project Structure)](#3-โครงสร้างโปรเจกต์-project-structure)
4. [การเริ่มต้นใช้งานบนเครื่อง Local (Local Development)](#4-การเริ่มต้นใช้งานบนเครื่อง-local-local-development)
5. [การตั้งค่า Environment Variables](#5-การตั้งค่า-environment-variables)
6. [การตรวจสอบคุณภาพและชุดทดสอบอัตโนมัติ (Testing & Quality Gates)](#6-การตรวจสอบคุณภาพและชุดทดสอบอัตโนมัติ-testing--quality-gates)
7. [การคอนเทนเนอร์ไรเซชันระดับ Production (Docker & Nginx)](#7-การคอนเทนเนอร์ไรเซชันระดับ-production-docker--nginx)
8. [ระบบ CI/CD Pipeline (GitHub Actions)](#8-ระบบ-cicd-pipeline-github-actions)

---

## 1. ฟีเจอร์หลักของระบบ (Key Features)

* 🔐 **Dual-Token Authentication (JWT State):**
  * จัดเก็บ Access Token ไว้ใน Memory เพื่อป้องกัน XSS และ Refresh Token สำหรับต่ออายุเซสชัน
  * ระบบ **Axios Interceptor Auto-Refresh on 401**: รวมคำขอที่เข้ามาพร้อมกัน (Request Queuing) แล้วสลับขอ Token ใหม่อัตโนมัติโดยที่ผู้ใช้ไม่หลุดออกจากหน้าจอ
* 💬 **Real-Time WebSocket Messaging & Collaboration:**
  * รับ-ส่งข้อความสดข้ามเบราว์เซอร์ผ่าน WebSocket เชื่อมต่อกับ Redis Pub/Sub หลังบ้าน
  * แสดงสถานะ **"กำลังพิมพ์..." (Typing Indicator)** และไฟสถานะออนไลน์ (Online Presence)
  * ระบบตัดการเชื่อมต่อและเชื่อมต่อใหม่อัตโนมัติ (Auto-Reconnect with Exponential Backoff & Jitter)
* 🔍 **PostgreSQL Full-Text Search UI (Ctrl + K):**
  * คีย์ลัด **`Ctrl + K`** (หรือ `Cmd + K`) เพื่อเปิดหน้าต่างค้นหาข้อความย้อนหลัง
  * ป้องกันการส่งคำขอถี่เกินไป (Debounce) ค้นหาผ่าน PostgreSQL `tsvector` และจัดอันดับด้วย `ts_rank`
  * เมื่อคลิกที่ผลการค้นหา ระบบจะเลื่อนหน้าจอ (Scroll) และเน้นข้อความในประวัติแชทให้ทันที
* 🛡️ **Workspace & Channel Administration (RBAC):**
  * แยกการควบคุมสิทธิ์ตามบทบาท (Global Admin, Workspace Owner, Member)
  * หน้าต่าง **ConfirmDeleteDialog** ป้องกันการลบข้อมูลโดยไม่ตั้งใจ โดยบังคับให้ผู้ใช้ต้องพิมพ์ชื่อห้องแชทให้ตรงกัน 100% ถึงจะยอมให้ลบ
  * ป้องกันการกู้คืนห้องที่ถูกลบไปแล้วด้วย Deletion Tombstones
* 📱 **Modern & Responsive UI Layout:**
  * หน้าจอขนาดใหญ่ (Desktop): แสดง Sidebar แบ่งหมวดหมู่ Workspace และ Channel ชัดเจน
  * หน้าจอขนาดเล็ก (Mobile < 768px): สลับเป็น Accessible Mobile Drawer พร้อมระบบ Focus Trap และรองรับปุ่ม `Escape`

---

## 2. เทคโนโลยีและเครื่องมือที่ใช้ (Tech Stack)

| หมวดหมู่ | เทคโนโลยี / ไลบรารี | เวอร์ชัน / หน้าที่ |
|---|---|---|
| **Core Framework** | React + React DOM | v19.2.0 (Component-Driven Architecture) |
| **Language** | TypeScript | v5.9.3 (Strict Type-Safety ป้องกัน Runtime Errors) |
| **Build Tool & Bundler** | Vite | v7.3.7 (Fast HMR & Optimized Production Build) |
| **Styling & CSS** | Tailwind CSS + PostCSS | v3.4.17 (Utility-first CSS Framework) |
| **Routing** | React Router DOM | v7.9.0 (SPA Declarative Routing with Protected Routes) |
| **HTTP Client** | Axios | v1.13.0 (API Requests with Request/Response Interceptors) |
| **Icons** | Lucide React | v0.468.0 (Modern Scalable Vector Icons) |
| **Test Runner** | Node.js Native Test Runner | v20+ (`node --test tests/*.test.mjs` พร้อม JSDOM) |
| **Code Quality** | ESLint + TypeScript ESLint | v10.13.0 (Zero Warning Policy) |
| **Production Server** | Nginx Alpine | Multi-stage Container with SPA Fallback & Gzip Compression |

---

## 3. โครงสร้างโปรเจกต์ (Project Structure)

```text
livechat frontend/
├── nginx.conf                 # คอนฟิก Nginx สำหรับ Production (SPA Routing & Caching)
├── Dockerfile                 # Multi-stage Build (Node 20 Builder -> Nginx Runtime)
├── package.json               # Dependencies และ Test Scripts
├── tsconfig.json              # TypeScript Strict Compiler Options
├── vite.config.ts             # Vite Configuration
├── tests/                     # ชุดทดสอบอัตโนมัติ (80 Tests Pass 100%)
│   ├── auth.test.mjs          # ทดสอบระบบ Authentication, Validation และ Token Refresh
│   ├── websocket.test.mjs     # ทดสอบ Real-time Transport, Reconnect และ Multiplexing
│   ├── search.test.mjs        # ทดสอบ Search Adapter, Debounce และ API Guard
│   └── search-modal.test.mjs  # ทดสอบ UI Modal, Focus Trap และ Keyboard Navigation
└── src/
    ├── components/            # Reusable UI Components (Sidebar, ChatArea, MessageItem, ConfirmDeleteDialog)
    ├── contexts/              # Global State (AuthContext, WebSocketContext, WorkspaceContext)
    ├── hooks/                 # Custom React Hooks
    ├── pages/                 # หน้าหลัก (Login, Register, Workspace)
    ├── services/              # API Transport, WebSocket Client และ Search Services
    ├── types/                 # TypeScript Interfaces และ Type Definitions
    ├── App.tsx                # Entry Route Configuration (Guest & Protected Routes)
    └── main.tsx               # React Application DOM Bootstrap
```

---

## 4. การเริ่มต้นใช้งานบนเครื่อง Local (Local Development)

### 4.1 ข้อกำหนดเบื้องต้น
* **Node.js:** เวอร์ชัน **20.19.0 ขึ้นไป** (แนะนำสาย LTS เช่น 20.x, 22.x หรือ 24.x)
* **npm:** เวอร์ชันที่มาพร้อม Node.js

### 4.2 ขั้นตอนการติดตั้งและรัน Development Server

```powershell
# 1. เข้าสู่โฟลเดอร์ livechat frontend
cd "livechat frontend"

# 2. ติดตั้ง Dependencies ทั้งหมดให้ตรงตาม package-lock.json
npm ci

# 3. รัน Development Server พร้อมระบบ Hot Module Replacement (HMR)
npm run dev
```

เปิดเว็บเบราว์เซอร์ไปที่: `http://localhost:5173`

---

## 5. การตั้งค่า Environment Variables

คัดลอกไฟล์ตัวอย่าง `.env.example` เป็น `.env.local` สำหรับการรันบนเครื่องตนเอง:

```env
# URL ปลายทางของ Backend REST API
VITE_API_BASE_URL=/api/v1

# โหมดการทำงานของระบบ (api หรือ mock สำหรับทดสอบออฟไลน์)
VITE_AUTH_MODE=api
VITE_WS_MODE=api
VITE_SEARCH_MODE=api
```

> **หมายเหตุ:** เมื่อรันผ่าน Nginx หรือ Docker Compose ระบบจะใช้ Reverse Proxy ส่งคำขอ `/api/v1` และ `/ws` ไปยัง Backend ให้อัตโนมัติบน Host และ Port เดียวกัน

---

## 6. การตรวจสอบคุณภาพและชุดทดสอบอัตโนมัติ (Testing & Quality Gates)

โปรเจกต์มี Quality Gates ครบถ้วน เพื่อให้มั่นใจก่อน Merge โค้ดเข้าสู่ `main`:

```powershell
# 1. ตรวจสอบความถูกต้องของ Types (Strict TypeScript)
npx tsc --noEmit

# 2. ตรวจสอบ Code Style และ Syntax (Zero Warnings Policy)
npm run lint

# 3. ทดสอบสร้าง Production Bundle (Build Smoke Test)
npm run build

# 4. รันชุดทดสอบอัตโนมัติครบทั้ง 80 Tests
npm test
```

### การรันชุดทดสอบแยกตามหมวดหมู่:
* **ทดสอบระบบ Auth & Token:** `npm run test:auth`
* **ทดสอบระบบ WebSocket & Pub/Sub:** `npm run test:websocket`
* **ทดสอบระบบค้นหา Search Modal:** `npm run test:search`

---

## 7. การคอนเทนเนอร์ไรเซชันระดับ Production (Docker & Nginx)

Dockerfile ถูกออกแบบด้วยเทคนิค **Multi-stage Build** เพื่อให้ Image มีขนาดเล็ก ปลอดภัย และมีประสิทธิภาพสูง:

1. **Stage 1 (Builder):** ใช้ `node:20-alpine` ทำการคอมไพล์ TypeScript และบันเดิลไฟล์ Static Web Assets ด้วย Vite เข้าสู่ `/app/dist`
2. **Stage 2 (Runtime):** ใช้ `nginx:alpine` คัดลอกเฉพาะไฟล์ใน `/app/dist` ไปเสิร์ฟ พร้อมคอนฟิก:
   * **SPA Fallback Routing:** แก้ปัญหา 404 เมื่อผู้ใช้กด Refresh หน้าเว็บด้วยคำสั่ง `try_files $uri $uri/ /index.html;`
   * **Gzip Compression:** บีบอัดไฟล์ HTML, JS และ CSS เพื่อการโหลดที่รวดเร็ว
   * **Asset Caching:** แคชไฟล์ที่มีแฮชชื่อไฟล์เพื่อประหยัดแบนด์วิดท์

### คำสั่งบิลด์และรัน Container เดี่ยว:
```powershell
# บิลด์ Docker Image
docker build -t livechat-frontend:latest .

# รันคอนเทนเนอร์บนพอร์ต 80
docker run -d --rm -p 80:80 --name livechat_frontend livechat-frontend:latest
```

---

## 8. ระบบ CI/CD Pipeline (GitHub Actions)

การทำงานของ CI/CD ฝั่ง Frontend ถูกควบคุมด้วย GitHub Actions workflow (`.github/workflows/ci.yml`):

* **Pull Request Checks (CI):** ทุกครั้งที่มีการเปิด PR เข้าสู่ `main` ระบบจะรัน `npx tsc --noEmit`, `npm run lint`, `npm test` (80 Tests) และ `npm run build` โดยอัตโนมัติ หากมีข้อผิดพลาดแม้แต่จุดเดียวจะไม่ยอมให้ Merge
* **Automated Deployment (CD):** เมื่อโค้ดถูก Merge เข้าสู่ `main` ระบบจะบิลด์ Docker Image แล้ว Push ขึ้นสู่ **Docker Hub** พร้อมแจ้งเซิร์ฟเวอร์ Cloud เพื่ออัปเดตเวอร์ชันใหม่ทันทีแบบไร้รอยต่อ
