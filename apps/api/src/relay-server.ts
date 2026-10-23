/**
 * รัน relay บนเครื่องในประเทศไทย: RELAY_KEY=<กุญแจลับ> PORT=8788 node dist/relay.js
 * ดูขั้นตอนติดตั้งใน docs/RELAY.md
 */
import { serve } from '@hono/node-server';
import { createRelay } from './relay.js';

const key = process.env.RELAY_KEY ?? '';
const port = Number(process.env.PORT ?? 8788);
const app = createRelay({ key });

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`flood-watch relay: http://localhost:${info.port} (targets: /health)`);
});
