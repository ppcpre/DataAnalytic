# Pre-Monitoring — ติดตามน้ำท่วม กทม. และปริมณฑล (Flood Watch PWA)

Progressive Web App สำหรับประชาชนทั่วไป ดูระดับน้ำ ฝนสะสม 24 ชม. ระดับน้ำประตูระบายน้ำ น้ำท่วมถนน ภาพเรดาร์ฝน
และภาพสดจากกล้อง CCTV ของหน่วยงาน ในกรุงเทพฯ และ 5 จังหวัดปริมณฑล — https://dataanalytic.precare.workers.dev

แผนโครงการ: [`docs/PLAN.md`](docs/PLAN.md)

## โครงสร้าง

```
apps/api         Hono — ดึง/แปลงข้อมูลจากแหล่งต่าง ๆ, cache, ส่ง JSON (รันบน Cloudflare Workers หรือ Node.js)
apps/web         PWA (Vite + TypeScript + Leaflet), แผนที่ฐาน OpenFreeMap
packages/shared  type, เกณฑ์สถานะ และตัวแปลงข้อมูล ThaiWater ที่ใช้ร่วมกัน
```

### Tech stack

| ส่วน | ใช้ |
|---|---|
| หน้าเว็บ | TypeScript 5.9 (ไม่ใช้ framework), Vite 8, ฟอนต์ Mitr, รองรับโหมดมืด |
| แผนที่ | Leaflet 1.9 + MapLibre GL 6 (maplibre-gl-leaflet) กับ OpenFreeMap; เครื่องเก่าใช้ OpenStreetMap แทนอัตโนมัติ |
| วิดีโอกล้อง | hls.js 1.7 (รวม iOS 17.1+ ผ่าน ManagedMediaSource) และตัวเล่น HLS ของ Safari เป็นตัวสำรอง; MJPEG/ภาพนิ่ง/หน้าเว็บฝัง |
| PWA / ออฟไลน์ | vite-plugin-pwa + Workbox (service worker) |
| กราฟ | SVG วาดเอง (กราฟ 24 ชม., ภาพเทียบตลิ่งกับระดับน้ำ) |
| API | Hono 4 — Cloudflare Workers (ใช้งานจริง) หรือ Node.js 20+ (@hono/node-server) |
| เชื่อมเซิร์ฟเวอร์ที่มีแต่ IP | TCP socket ของ Workers (`cloudflare:sockets`, `src/raw-http.ts`) |
| ข้อมูลย้อนหลัง | Cloudflare D1 (ถ้าผูกไว้) หรือหน่วยความจำ; Cron ทุก 15 นาที |
| Hosting / deploy | Cloudflare Workers + Static Assets, Workers Builds deploy อัตโนมัติเมื่อ push; Wrangler 4 |
| ทดสอบ | Vitest 5, TypeScript typecheck; ทดสอบเว็บจริงด้วย Playwright บน GitHub Actions (Chrome และ WebKit แบบ iPhone) |

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
| `NONT_LIVE` | `true` | ดึงภาพกล้อง/ระดับน้ำสดของเทศบาลนครนนทบุรี — `false` = ปักหมุดจากรายชื่อที่บันทึกไว้เท่านั้น |
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
- **Cloudflare:** Cron Trigger ดึงข้อมูลทุก 15 นาที แล้วเก็บลงฐานข้อมูล D1 (`DB`) ถาวร 7 วัน

D1 ผูกไว้ใน `wrangler.jsonc` โดยไม่ระบุ `database_id` — `wrangler deploy` สร้างฐานข้อมูล `flood-watch`
ในบัญชี Cloudflare ให้เองครั้งแรกและผูกกับ Worker (automatic resource provisioning) ตารางสร้างเองเมื่อใช้งานครั้งแรก
ตรวจได้ที่ `GET /api/health` → `"history": "d1"` (ถ้าเป็น `"memory"` แปลว่ายังไม่ได้ผูก D1)

### กล้อง CCTV บนแผนที่

หมุดกล้องมาจากรายชื่อกล้องของ Longdo Traffic (`https://traffic.longdo.com/camera.json` — กล้องของ กทม. และกรมทางหลวงผ่านมูลนิธิ iTIC)
API เลือกเฉพาะกล้องใน 6 จังหวัด แล้วแต่ละหมุดลิงก์ไปเปิดกล้องตัวนั้นที่ `https://traffic.longdo.com/camera?vdo=<รหัสกล้อง>`
เมื่อแตะหมุด หน้าแอปจะแสดงภาพจากเซิร์ฟเวอร์ของมูลนิธิ iTIC โดยตรง (เฉพาะ URL แบบ https ไม่ผ่านและไม่เก็บภาพไว้ที่ API ของเรา)
โดยลองตามลำดับ: วิดีโอ HLS (`hls.js` รุ่นเบา โหลดเมื่อจำเป็น, iPhone/iPad เล่นเอง) → MJPEG → ภาพนิ่งรีเฟรชทุก 10 วินาที
แต่ละแบบรอ 10 วินาที มีปุ่มโหลดใหม่ และหยุดโหลดภาพเมื่อปิดหน้ารายละเอียด
กล้องกรมทางหลวง (PER-*) มีเฉพาะ HLS — ลิงก์ภาพนิ่ง/MJPEG ของ iTIC ส่งข้อมูลว่างเปล่า
หมุดสีน้ำเงินเข้ม = มีวิดีโอ HLS, หมุดขอบน้ำเงิน = มีแต่ภาพนิ่ง/MJPEG (ส่วนใหญ่ออฟไลน์ที่ต้นทาง)
API ดึงรายชื่อกล้องชั่วโมงละครั้ง (`CAMERA_CACHE_SECONDS`)

- ปิดแหล่งนี้: ตั้ง `CAMERA_LIST_URL` เป็นค่าว่าง
- เพิ่มกล้องที่ตรวจสอบพิกัดเองได้ใน `apps/api/src/data/cameras.ts` (แสดงร่วมกัน)
- ควรขออนุญาต/แจ้ง Longdo และมูลนิธิ iTIC ก่อนเปิดใช้งานจริงในวงกว้าง เพราะเป็นข้อมูลที่เว็บ Longdo ใช้เอง ไม่ใช่ API ที่ประกาศให้ใช้สาธารณะ

จุดวัดระดับน้ำ (หมุดหยดน้ำสีเขียวอมฟ้า) มาจากแหล่งเพิ่มเติม:

- **เทศบาลนครนนทบุรี** — `http://182.52.224.70/json.php?app=station` รายชื่อจุดพร้อมพิกัด ระดับน้ำสองฝั่งประตู ฝน และภาพกล้อง
  ปักหมุดเฉพาะจุดที่มีกล้อง ภาพกล้องผ่าน `/api/nont/image?cam=<ชื่อกล้อง>` (รับเฉพาะชื่อกล้องตามรูปแบบของต้นทาง)
  เซิร์ฟเวอร์มีแต่ IP และ http — บน Cloudflare Workers ดึงผ่าน TCP socket (`cloudflare:sockets`, `src/raw-http.ts`) ต่อได้เฉพาะเครื่องนี้
  เพราะ `fetch()` ไปที่ IP ได้ error 1003; บน Node.js ใช้ `fetch()` ปกติ
  ดึงไม่ได้ → ปักหมุดจากรายชื่อที่บันทึกไว้ (`data/nonthaburi.ts`) และลิงก์ไปหน้ารวมกล้องของเทศบาล; ค่าวัดที่เก่ากว่า 12 ชม. ไม่แสดง
- **เทศบาลนครปากเกร็ด** — เซนเซอร์ระดับน้ำ `https://www.pakkretconnect.com/liffwater/eon` (อ่านจากตัวแปร `sensorData` ในหน้าเว็บ)
- กล้องจราจรปากเกร็ด (`thaiclouderp.com/CCTV_MONITOR`) เปิดได้เฉพาะจากในประเทศไทย จึงเป็นลิงก์ในแท็บกล้องแทนหมุด
- **กล้องเทศบาลเมืองบางกรวย** (StreamBridge) — `https://app.streambridge.online/api/public/bangkruai-city` รายชื่อกล้องพร้อมพิกัดและภาพล่าสุด
  ภาพสด: API ของแอปขอ session (`/api/streambridge/<slug>/<id>/session` → POST ต้นทาง เพราะต้นทางไม่อนุญาต CORS) แล้วเล่น HLS ตรงจากต้นทาง
  ถ้าเปิดภาพสดไม่ได้ใช้ภาพล่าสุดและบอกอายุของภาพ; เพิ่มหน่วยงานอื่นด้วย `STREAMBRIDGE_SLUGS`
- **ภาพเรดาร์ฝน** (แท็บกล้อง) — ThaiWater `analyst/radar_img` เลือกเรดาร์หนองแขม/หนองจอก (กทม.) และสุวรรณภูมิ (กรมอุตุฯ)
  ภาพผ่าน `shared/image?image=<media_path>`; หน้าเว็บดึงตรงจาก ThaiWater (อนุญาต CORS ให้โดเมนแอป)

แหล่งที่ตรวจแล้วแต่ยังใช้ไม่ได้ (ต.ค. 2569):
Traffy Fondue public API และ data.bangkok.go.th ต่อไม่ได้จากต่างประเทศ, data.go.th / EXAT / RID hydro / weather.bangkok.go.th มีระบบกันบอท,
RID `swoc-api-service` ต้องล็อกอิน, ThaiWater `analyst/cctv` ในพื้นที่มี 9 จุดแต่ลิงก์เป็น dyndns ที่ไม่มีแล้วหรือไม่มีลิงก์
