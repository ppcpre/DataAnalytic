# ติดตามน้ำท่วม กทม. และปริมณฑล (Flood Watch PWA)

Progressive Web App สำหรับประชาชนทั่วไป ดูระดับน้ำ ฝนสะสม 24 ชม. สถานะประตูระบายน้ำ
และลิงก์ไปยังกล้อง CCTV ของหน่วยงาน ในกรุงเทพฯ และ 5 จังหวัดปริมณฑล

แผนโครงการ: [`docs/PLAN.md`](docs/PLAN.md)

## โครงสร้าง

```
apps/api         Node.js + Hono — ดึงข้อมูลจาก ThaiWater, กรองพื้นที่, cache, ส่ง JSON
apps/web         PWA (Vite + TypeScript + Leaflet + vite-plugin-pwa), แผนที่ฐาน OpenFreeMap
packages/shared  type และเกณฑ์สถานะที่ใช้ร่วมกัน
```

## เริ่มพัฒนา

ต้องใช้ Node.js 20 ขึ้นไป

```bash
npm install
npm run dev        # API (ข้อมูลตัวอย่าง) ที่ :8787 + หน้าเว็บที่ http://localhost:5173
npm test           # unit tests
npm run typecheck
npm run build
```

`npm run dev` ใช้ **ข้อมูลตัวอย่าง** เป็นค่าเริ่มต้น (หน้าเว็บจะแสดงแถบสีแดงเตือนว่าไม่ใช่ข้อมูลจริง)
หากต้องการดึงข้อมูลจริง: `DATA_MODE=live npm run dev --workspace @flood-watch/api`

## ตัวแปรสภาพแวดล้อม (API)

| ตัวแปร | ค่าเริ่มต้น | คำอธิบาย |
|---|---|---|
| `PORT` | `8787` | พอร์ตของ API |
| `DATA_MODE` | `live` | `live` = ดึงจาก ThaiWater, `sample` = ข้อมูลตัวอย่าง |
| `CORS_ORIGIN` | `*` | origin ของหน้าเว็บที่อนุญาต คั่นด้วย `,` |
| `CACHE_TTL_SECONDS` | `300` | อายุ cache |
| `STALE_MAX_SECONDS` | `21600` | ส่งข้อมูลเก่าได้นานสุดเมื่อต้นทางล่ม |
| `THAIWATER_BASE_URL` | `https://api-v3.thaiwater.net/api/v1/thaiwater30/public` | |
| `THAIWATER_WATERLEVEL_URL` / `THAIWATER_RAIN_URL` | `<base>/waterlevel_load`, `<base>/rain_24h` | กำหนดแยกรายตัว |
| `THAIWATER_FLOODGATE_URL` | (ว่าง) | endpoint สถานะประตูระบายน้ำ — ว่าง = ชั้นข้อมูลนี้ไม่มีจุด |
| `KEY_STATION_CODES` | `C.2,C.13,C.7A,C.35` | รหัสสถานีต้นน้ำสำคัญ (นครสวรรค์, ท้ายเขื่อนเจ้าพระยา, บ้านบางแก้ว อ่างทอง, บ้านป้อม อยุธยา) เรียงจากต้นน้ำ |
| `MAX_READING_AGE_HOURS` | `12` | ไม่แสดงค่าที่ตรวจวัดเก่ากว่านี้ (ชั่วโมง) — สถานีที่หยุดส่งข้อมูลจะไม่ถูกนับเป็นเฝ้าระวัง |
| `GEOCODER_URL` | `https://photon.komoot.io/api/` | บริการค้นหาสถานที่ (รูปแบบ Photon, ข้อมูล OpenStreetMap) — ว่าง = ปิดการค้นหาสถานที่ |
| `GEOCODER_BBOX` | `13.4,99.8,14.3,100.95` | กรอบพื้นที่ค้นหา (minLat,minLng,maxLat,maxLng) |
| `CAMERA_LIST_URL` | `https://traffic.longdo.com/camera.json` | รายชื่อกล้อง CCTV พร้อมพิกัด — ว่าง = ใช้เฉพาะ `data/cameras.ts` |
| `CAMERA_CACHE_SECONDS` | `3600` | อายุ cache รายชื่อกล้อง |
| `GOOGLE_FLOOD_API_KEY` | (ว่าง) | API key ของ Google Flood Forecasting API — ว่าง = ปิดชั้นพยากรณ์ Google |
| `GOOGLE_FLOOD_BBOX` | `13.3,99.7,15.9,101.2` | กรอบพื้นที่จุดพยากรณ์ที่แสดง (minLat,minLng,maxLat,maxLng) |

### การขอใช้ Google Flood Forecasting API (ฟรี)

1. สมัคร waitlist ที่ https://sites.research.google/gr/floodforecasting/api-waitlist/ (อาจรอหลายเดือน)
2. เมื่อได้รับอีเมลอนุมัติ ตอบกลับด้วย Google Cloud Project ID
3. เปิดใช้ Flood Forecasting API ใน project นั้น สร้าง API key แล้วตั้งเป็น `GOOGLE_FLOOD_API_KEY`

### ข้อมูลย้อนหลังและแนวโน้ม (↑↓)

API บันทึกค่าระดับน้ำทุกครั้งที่ดึงข้อมูลใหม่ แล้วใช้คำนวณแนวโน้มเทียบกับเมื่อ ~3 ชม.ก่อน
(`trend` ในแต่ละสถานี) และให้บริการกราฟย้อนหลังที่ `GET /api/history/:stationId?hours=24`

- **Node.js:** เก็บในหน่วยความจำ (หายเมื่อรีสตาร์ท)
- **Cloudflare:** Cron Trigger ดึงข้อมูลทุก 15 นาที ถ้าผูกฐานข้อมูล D1 ไว้ ข้อมูลจะเก็บถาวร 7 วัน
  ถ้าไม่ผูก จะเก็บในหน่วยความจำชั่วคราวของ Worker (แนวโน้มอาจว่างบ่อย)

เปิดใช้ D1 (ฟรี):

```bash
npx wrangler d1 create flood-watch
```

แล้วเอา `//` ออกจากส่วน `d1_databases` ใน `wrangler.jsonc` และใส่ `database_id` ที่ได้
ตารางจะถูกสร้างอัตโนมัติเมื่อใช้งานครั้งแรก

### กล้อง CCTV บนแผนที่

หมุดกล้องมาจากรายชื่อกล้องของ Longdo Traffic (`https://traffic.longdo.com/camera.json` — กล้องของ กทม. และกรมทางหลวงผ่านมูลนิธิ iTIC)
API เลือกเฉพาะกล้องใน 6 จังหวัด แล้วแต่ละหมุดลิงก์ไปเปิดกล้องตัวนั้นที่ `https://traffic.longdo.com/camera?vdo=<รหัสกล้อง>`
แอปไม่ได้นำภาพกล้องมาแสดงหรือเก็บซ้ำ ดึงรายชื่อชั่วโมงละครั้ง (`CAMERA_CACHE_SECONDS`)

- ปิดแหล่งนี้: ตั้ง `CAMERA_LIST_URL` เป็นค่าว่าง
- เพิ่มกล้องที่ตรวจสอบพิกัดเองได้ใน `apps/api/src/data/cameras.ts` (แสดงร่วมกัน)
- ควรขออนุญาต/แจ้ง Longdo ก่อนเปิดใช้งานจริงในวงกว้าง เพราะเป็นข้อมูลที่เว็บ Longdo ใช้เอง ไม่ใช่ API ที่ประกาศให้ใช้สาธารณะ

## ตัวแปรสภาพแวดล้อม (หน้าเว็บ, ตอน build)

| ตัวแปร | คำอธิบาย |
|---|---|
| `VITE_API_BASE` | URL ของ API เช่น `https://flood-api.onrender.com` (ว่าง = origin เดียวกัน) |
| `BASE_PATH` | path ย่อยเมื่อโฮสต์บน GitHub Pages เช่น `/DataAnalytic/` |

## เผยแพร่บน Cloudflare (ฟรี)

หน้าเว็บและ API อยู่ใน Cloudflare Worker ตัวเดียว (`wrangler.jsonc`): ไฟล์ใน `apps/web/dist` เสิร์ฟเป็น
Static Assets ส่วน `/api/*` รันโค้ดใน `apps/api/src/worker.ts` — อยู่ใน free plan ของ Workers (100,000 คำขอ/วัน)

### Deploy ผ่าน Cloudflare Workers Builds (ที่ใช้อยู่)

Worker ชื่อ `dataanalytic` เชื่อมกับ repo นี้จากหน้า Cloudflare (Import a repository)
ทุกครั้งที่ push Cloudflare จะติดตั้ง dependencies แล้วรัน `npx wrangler deploy`
ซึ่งจะ build หน้าเว็บให้เองตาม `build.command` ใน `wrangler.jsonc` — ชื่อใน `wrangler.jsonc` ต้องตรงกับชื่อ Worker

### Deploy อัตโนมัติจาก GitHub Actions (ทางเลือก)

ทุกครั้งที่ push ไปยัง default branch, GitHub Actions (`.github/workflows/deploy.yml`) จะเทสต์แล้ว deploy ให้
ต้องตั้งค่าครั้งเดียว:

1. Cloudflare Dashboard → **My Profile → API Tokens → Create Token** → ใช้ template **Edit Cloudflare Workers**
2. คัดลอก **Account ID** จากหน้า Workers & Pages (แถบด้านขวา)
3. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret** เพิ่ม
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
4. ไปที่แท็บ **Actions → Deploy to Cloudflare → Run workflow** (หรือ push commit ใหม่)
5. เว็บจะอยู่ที่ `https://dataanalytic.<subdomain>.workers.dev`

ถ้ายังไม่ได้ตั้ง secret ขั้น deploy จะถูกข้าม (มีคำเตือนใน Actions) แต่เทสต์ยังรันตามปกติ

### Deploy จากเครื่องตัวเอง

```bash
npx wrangler login
npm run deploy
```

### ตั้งค่าเพิ่มเติม

- ค่าทั่วไป (เช่น `DATA_MODE`, `KEY_STATION_CODES`) แก้ใน `vars` ของ `wrangler.jsonc`
- ความลับ (เช่น Google Flood API key): `npx wrangler secret put GOOGLE_FLOOD_API_KEY`
- ทดสอบแบบ Cloudflare บนเครื่อง: `npm run cf:dev` (เพิ่ม `-- --var DATA_MODE:sample` เพื่อใช้ข้อมูลตัวอย่าง)

### ทางเลือก: รัน API ด้วย Node.js

API ยังรันแบบ Node.js ได้ (`npm run build && npm start --workspace @flood-watch/api`) เช่นบน Render
แล้ว build หน้าเว็บด้วย `VITE_API_BASE=<url ของ API>`

## ข้อจำกัดความรับผิดชอบ

ข้อมูลมาจากแหล่งข้อมูลสาธารณะ ใช้ประกอบการตัดสินใจเท่านั้น ไม่ใช่ประกาศเตือนภัยอย่างเป็นทางการ
