# livechat-frontend

เว็บแอปพลิเคชัน Real-Time Live Chat Platform ฝั่งหน้าบ้าน (Client UI) พัฒนาด้วย React + Vite + TypeScript และ Tailwind CSS

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
* **Frontend #2:** ผู้รับผิดชอบ (Frontend Lead) จะสร้างโครงสร้างโปรเจกต์ React + Vite (`package.json`, `vite.config.ts`, `src/`) ต่อไป
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
docker compose --profile app up -d --build frontend
```

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
