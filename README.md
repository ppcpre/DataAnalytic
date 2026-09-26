# ติดตามน้ำท่วม กทม. และปริมณฑล (Flood Watch PWA)

Progressive Web App สำหรับประชาชนทั่วไป ดูระดับน้ำ ฝนสะสม 24 ชม. สถานะประตูระบายน้ำ
และลิงก์ไปยังกล้อง CCTV ของหน่วยงาน ในกรุงเทพฯ และ 5 จังหวัดปริมณฑล

แผนโครงการ: [`docs/PLAN.md`](docs/PLAN.md)

## โครงสร้าง

```
apps/api         Node.js + Hono — ดึงข้อมูลจาก ThaiWater, กรองพื้นที่, cache, ส่ง JSON
apps/web         PWA (Vite + TypeScript + Leaflet + vite-plugin-pwa)
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

## ตัวแปรสภาพแวดล้อม (หน้าเว็บ, ตอน build)

| ตัวแปร | คำอธิบาย |
|---|---|
| `VITE_API_BASE` | URL ของ API เช่น `https://flood-api.onrender.com` (ว่าง = origin เดียวกัน) |
| `BASE_PATH` | path ย่อยเมื่อโฮสต์บน GitHub Pages เช่น `/DataAnalytic/` |

## เผยแพร่แบบฟรี (แนะนำ)

- **API** → Render (Web Service, free): Build `npm install && npm run build --workspace @flood-watch/api`,
  Start `npm start --workspace @flood-watch/api`, ตั้ง `CORS_ORIGIN` เป็น URL ของหน้าเว็บ
- **หน้าเว็บ** → GitHub Pages หรือ Cloudflare Pages: build ด้วย
  `VITE_API_BASE=<url ของ API> npm run build --workspace @flood-watch/web` แล้วอัปโหลด `apps/web/dist`

## ข้อจำกัดความรับผิดชอบ

ข้อมูลมาจากแหล่งข้อมูลสาธารณะ ใช้ประกอบการตัดสินใจเท่านั้น ไม่ใช่ประกาศเตือนภัยอย่างเป็นทางการ
