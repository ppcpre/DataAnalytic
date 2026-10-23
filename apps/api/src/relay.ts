/**
 * Relay สำหรับรันบนเครื่องในประเทศไทย — ส่งต่อคำขอไปยังเว็บที่ไม่ตอบการเชื่อมต่อจาก Cloudflare Workers
 * (เช่น bmatraffic.com ซึ่งรับการเชื่อมต่อแต่ไม่ตอบอะไรกลับมาจนหมดเวลา)
 *
 * ความปลอดภัย:
 * - ทุกคำขอต้องมี header x-relay-key ตรงกับ RELAY_KEY (ตั้งเป็นความลับทั้งสองฝั่ง)
 * - ส่งต่อได้เฉพาะ host และรูปแบบ path ที่กำหนดไว้ในโค้ด ไม่ใช่ proxy ทั่วไป
 */
import { Hono } from 'hono';

export const RELAY_KEY_HEADER = 'x-relay-key';

interface Target {
  base: string;
  /** path ที่ยอมให้ส่งต่อ (รวม query string) */
  paths: RegExp[];
}

/** ปลายทางที่ relay ส่งต่อให้ได้ — เพิ่มแหล่งใหม่ที่นี่ */
export const RELAY_TARGETS: Record<string, Target> = {
  // กล้องจราจร กทม.: หน้าแรก (รายชื่อกล้อง) และภาพล่าสุดของกล้อง
  bmatraffic: { base: 'http://www.bmatraffic.com', paths: [/^\/$/, /^\/show\.aspx\?image=\d{1,6}&&time=\d{10,14}$/] },
};

/** เทียบกุญแจโดยใช้เวลาคงที่ (ไม่บอกใบ้ความยาวที่ตรงกัน) */
function sameKey(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export interface RelayOptions {
  key: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export function createRelay({ key, fetch: doFetch = fetch, timeoutMs = 20000 }: RelayOptions) {
  if (key.length < 24) throw new Error('RELAY_KEY ต้องยาวอย่างน้อย 24 ตัวอักษร');
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, targets: Object.keys(RELAY_TARGETS) }));

  app.get('/:target', async (c) => {
    c.header('cache-control', 'no-store');
    if (!sameKey(c.req.header(RELAY_KEY_HEADER) ?? '', key)) return c.json({ error: 'unauthorized' }, 401);
    const target = RELAY_TARGETS[c.req.param('target')];
    const path = c.req.query('path') ?? '';
    if (!target) return c.json({ error: 'unknown target' }, 404);
    if (!target.paths.some((re) => re.test(path))) return c.json({ error: 'path not allowed' }, 400);
    try {
      const res = await doFetch(`${target.base}${path}`, {
        headers: { 'user-agent': 'Mozilla/5.0 PreMonitoring-Relay' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = new Uint8Array(await res.arrayBuffer());
      return c.body(body, res.status as 200, {
        'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
    } catch (err) {
      console.error('[relay]', c.req.param('target'), (err as Error).message);
      return c.json({ error: 'upstream failed', detail: (err as Error).message.slice(0, 200) }, 502);
    }
  });

  return app;
}

/** ฝั่ง API: GET ผ่าน relay แล้วคืนรูปแบบเดียวกับ rawGet */
export async function relayGet(
  relayUrl: string,
  key: string,
  target: string,
  path: string,
  doFetch: typeof fetch = fetch,
): Promise<{ status: number; headers: Record<string, string>; body: Uint8Array }> {
  const res = await doFetch(`${relayUrl.replace(/\/$/, '')}/${target}?path=${encodeURIComponent(path)}`, {
    headers: { [RELAY_KEY_HEADER]: key },
    signal: AbortSignal.timeout(25000),
  });
  if (res.status === 401 || res.status === 400 || res.status === 404) throw new Error(`relay HTTP ${res.status}`);
  return {
    status: res.status,
    headers: Object.fromEntries([...res.headers].map(([k, v]) => [k.toLowerCase(), v])),
    body: new Uint8Array(await res.arrayBuffer()),
  };
}
