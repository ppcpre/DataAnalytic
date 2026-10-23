import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { NONT_BASE } from './adapters/nonthaburi.js';
import { relayGet } from './relay.js';

const config = loadConfig();
const app = createApp(config, undefined, undefined, {
  // Node.js เรียกเซิร์ฟเวอร์ที่มีแต่ IP ด้วย fetch() ได้ตามปกติ
  nontGet: async (path) => {
    const res = await fetch(`${NONT_BASE}${path}`, { signal: AbortSignal.timeout(15000) });
    return {
      status: res.status,
      headers: Object.fromEntries([...res.headers].map(([k, v]) => [k.toLowerCase(), v])),
      body: new Uint8Array(await res.arrayBuffer()),
    };
  },
  // ใช้ relay เดียวกับ Workers ได้ถ้าตั้ง RELAY_URL/RELAY_KEY (ไม่ตั้ง = ใช้ getText/getImage ตรง)
  ...(process.env.RELAY_URL && process.env.RELAY_KEY
    ? { bmaGet: (path: string) => relayGet(process.env.RELAY_URL!, process.env.RELAY_KEY!, 'bmatraffic', path), bmaVia: 'relay' }
    : {}),
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`flood-watch api: http://localhost:${info.port} (DATA_MODE=${config.dataMode})`);
});
