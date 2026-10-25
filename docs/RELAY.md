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

Worker ต้องเรียก relay ด้วย **ชื่อโดเมนแบบ HTTPS** (เรียก IP ตรง ๆ ไม่ได้) — ไม่มีโดเมนของตัวเองก็ได้ เลือกตามชนิดเครื่อง:

### ก. คอมพิวเตอร์ / Raspberry Pi ที่บ้านหรือที่ทำงาน → Tailscale Funnel (ฟรี ไม่ต้องมีโดเมน ไม่ต้องเปิดพอร์ต)

ใช้ได้แม้เน็ตบ้านจะเป็น CGNAT (ไม่มี IP สาธารณะ) ได้ชื่อถาวรรูปแบบ `https://<ชื่อเครื่อง>.<tailnet>.ts.net`

```sh
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up                       # ล็อกอินบัญชี Tailscale (ฟรี) ตามลิงก์ที่ขึ้น
sudo tailscale funnel --bg 8788         # เปิด relay (พอร์ต 8788) ออกอินเทอร์เน็ตทาง HTTPS
tailscale funnel status                 # จด URL https://….ts.net ไว้ใช้ในข้อ 5
```

(ครั้งแรกอาจต้องกดเปิดใช้ Funnel ในหน้า admin ของ Tailscale ตามลิงก์ที่คำสั่งแจ้ง)

### ข. VPS ที่มี IP สาธารณะ → DuckDNS + Caddy (ฟรี)

1. สมัคร https://www.duckdns.org (ล็อกอินด้วย Google/GitHub) ตั้งชื่อเช่น `floodrelay` แล้วใส่ IP ของ VPS
   → ได้ชื่อ `floodrelay.duckdns.org`
2. เปิดพอร์ต 80 และ 443 บน VPS แล้วติดตั้ง Caddy (ออกใบรับรอง HTTPS ให้อัตโนมัติ):

```sh
sudo apt install -y caddy
echo 'floodrelay.duckdns.org {
  reverse_proxy 127.0.0.1:8788
}' | sudo tee /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl https://floodrelay.duckdns.org/health   # → {"ok":true,...}
```

### ค. มีโดเมนบน Cloudflare (ถ้าซื้อภายหลัง ~350 บาท/ปี) → Cloudflare Tunnel

```sh
cloudflared tunnel login
cloudflared tunnel create flood-relay
cloudflared tunnel route dns flood-relay relay.<โดเมนของคุณ>
cloudflared tunnel run --url http://127.0.0.1:8788 flood-relay
```

> ไม่แนะนำ "quick tunnel" (`*.trycloudflare.com`) เพราะ URL เปลี่ยนทุกครั้งที่รันใหม่ ต้องตั้งค่า Worker ใหม่ทุกครั้ง

## 5. ตั้งค่า Worker

```sh
npx wrangler secret put RELAY_URL   # เช่น https://floodrelay.duckdns.org หรือ https://<เครื่อง>.<tailnet>.ts.net
npx wrangler secret put RELAY_KEY   # กุญแจเดียวกับข้อ 2
```

เมื่อตั้งครบ แอปจะเปิดกล้องจราจร กทม. แบบ `auto` เอง — แสดงเมื่อสุ่มตรวจแล้วต้นทางส่งภาพจริง (ปิดได้ด้วย `BMA_TRAFFIC=off`)
ตรวจสถานะที่ `https://<แอป>/api/bma/status` (`via: "relay"` เมื่อใช้ relay; ถ้าดึงไม่ได้จะบอกสาเหตุใน `detail`)

## เพิ่มแหล่งใหม่ผ่าน relay

เพิ่มรายการใน `RELAY_TARGETS` (host + รูปแบบ path ที่อนุญาต) แล้วให้ adapter ฝั่ง API เรียก `relayGet(...)` —
build และรัน relay ใหม่บนเครื่องในไทย
