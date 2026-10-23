# Relay ในประเทศไทย

บางแหล่งข้อมูลไม่ตอบการเชื่อมต่อจาก Cloudflare Workers (เช่น `bmatraffic.com` กล้องจราจร กทม. ~569 ตัว
รับการเชื่อมต่อแต่ไม่ส่งอะไรกลับจนหมดเวลา) หรือเปิดได้เฉพาะจากในไทย relay คือโปรแกรมเล็ก ๆ ที่รันบนเครื่องอื่น
แล้วส่งต่อคำขอเหล่านี้ให้ Worker — Worker ยังทำงานเหมือนเดิมทุกอย่าง

```
ผู้ใช้ → Cloudflare Worker ──(เฉพาะแหล่งที่ถูกบล็อก)──→ relay (เครื่องในไทย) → bmatraffic.com
```

- ส่งต่อได้เฉพาะปลายทางที่กำหนดใน `apps/api/src/relay.ts` (`RELAY_TARGETS`) ไม่ใช่ proxy ทั่วไป
- ทุกคำขอต้องมีกุญแจลับ (`x-relay-key`) ตรงกันทั้งสองฝั่ง
- ใช้ทรัพยากรน้อยมาก (Node.js ไฟล์เดียว ~110 KB) — VPS เล็กสุด, mini PC หรือ Raspberry Pi ก็พอ

## 1. เตรียมเครื่อง

เครื่องที่เปิดตลอดเวลา และเชื่อมต่อเน็ตได้ — ตัวเลือก:

| ตัวเลือก | หมายเหตุ |
|---|---|
| VPS ในไทย | แนะนำ ถ้าต้องการเปิดแหล่งที่ใช้ได้เฉพาะในไทยในอนาคต (เช่น กล้องจราจรปากเกร็ด) |
| คอมพิวเตอร์ / Raspberry Pi ที่บ้านหรือที่ทำงานในไทย | ฟรี ใช้ Cloudflare Tunnel ได้โดยไม่ต้องเปิดพอร์ต |
| VPS ต่างประเทศที่ไม่ใช่ Cloudflare | ใช้ได้สำหรับ `bmatraffic.com` (บล็อกเฉพาะ Cloudflare) แต่ไม่ช่วยแหล่งที่จำกัดเฉพาะในไทย |

## 2. สร้างกุญแจลับ (บนเครื่องของคุณ — อย่าส่งกุญแจในแชตหรือ commit ลง repo)

```sh
openssl rand -base64 32
```

## 3. รัน relay

ด้วย Docker (จากโฟลเดอร์รากของ repo):

```sh
docker build -f apps/api/Dockerfile.relay -t flood-watch-relay .
docker run -d --name flood-watch-relay --restart unless-stopped -p 127.0.0.1:8788:8788 \
  -e RELAY_KEY='<กุญแจจากข้อ 2>' flood-watch-relay
curl http://127.0.0.1:8788/health   # → {"ok":true,"targets":["bmatraffic"]}
```

หรือด้วย Node.js 20+ โดยตรง:

```sh
npm ci && npm run build:relay --workspace @flood-watch/api
RELAY_KEY='<กุญแจ>' PORT=8788 node apps/api/dist/relay.js
```

## 4. เปิดให้ Worker เรียกได้ทาง HTTPS

Worker ต้องเรียก relay ด้วยชื่อโดเมน (เรียก IP ตรง ๆ ไม่ได้) — ทางที่ง่ายที่สุดคือ **Cloudflare Tunnel** (ฟรี ไม่ต้องเปิดพอร์ต):

```sh
cloudflared tunnel login
cloudflared tunnel create flood-relay
cloudflared tunnel route dns flood-relay relay.<โดเมนของคุณ>
cloudflared tunnel run --url http://127.0.0.1:8788 flood-relay
```

(ต้องมีโดเมนที่อยู่บน Cloudflare; ถ้าไม่มี ใช้ VPS ที่มีโดเมน + HTTPS เช่น Caddy reverse proxy แทนได้)

## 5. ตั้งค่า Worker

```sh
npx wrangler secret put RELAY_URL   # เช่น https://relay.<โดเมนของคุณ>
npx wrangler secret put RELAY_KEY   # กุญแจเดียวกับข้อ 2
```

เมื่อตั้งครบ แอปจะเปิดกล้องจราจร กทม. แบบ `auto` เอง — แสดงเมื่อสุ่มตรวจแล้วต้นทางส่งภาพจริง (ปิดได้ด้วย `BMA_TRAFFIC=off`)
ตรวจสถานะที่ `https://<แอป>/api/bma/status` (`via: "relay"` เมื่อใช้ relay; ถ้าดึงไม่ได้จะบอกสาเหตุใน `detail`)

## เพิ่มแหล่งใหม่ผ่าน relay

เพิ่มรายการใน `RELAY_TARGETS` (host + รูปแบบ path ที่อนุญาต) แล้วให้ adapter ฝั่ง API เรียก `relayGet(...)` —
build และรัน relay ใหม่บนเครื่องในไทย
