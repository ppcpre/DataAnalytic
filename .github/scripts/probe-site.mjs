// ทดสอบลิงก์วิดีโอกล้องกรมทางหลวง (doh-sites.json) ด้วย Chrome จริงจากเว็บอื่น:
// เล่นข้ามโดเมนได้หรือไม่ (CORS) และใบรับรองของเซิร์ฟเวอร์วิดีโอผ่านในเบราว์เซอร์หรือไม่
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const sites = JSON.parse(readFileSync(new URL('./doh-sites.json', import.meta.url)));
const urls = [...new Set(sites.flatMap((s) => s.streams.map((x) => x.u)))];
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const p = await (await b.newContext()).newPage();
await p.goto('https://example.com/', { waitUntil: 'domcontentloaded' });
const res = await p.evaluate(async (urls) => {
  const out = {};
  let i = 0;
  const one = async (u) => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000);
    try {
      const r = await fetch(u, { signal: ac.signal, cache: 'no-store' });
      const text = await r.text();
      if (!r.ok || !text.startsWith('#EXTM3U')) return `http${r.status}`;
      const next = text.split('\n').find((l) => l && !l.startsWith('#'));
      if (!next) return 'empty';
      const r2 = await fetch(new URL(next.trim(), u), { signal: ac.signal, cache: 'no-store' });
      const t2 = await r2.text();
      return r2.ok && /#EXTINF/.test(t2) ? 'ok' : `chunk${r2.status}`;
    } catch (e) {
      return e.name === 'AbortError' ? 'timeout' : 'blocked';
    } finally {
      clearTimeout(t);
    }
  };
  await Promise.all(Array.from({ length: 8 }, async () => { while (i < urls.length) { const u = urls[i++]; out[u] = await one(u); } }));
  return out;
}, urls);
await b.close();
const tally = {};
for (const v of Object.values(res)) tally[v] = (tally[v] ?? 0) + 1;
console.log('STREAMS', urls.length, JSON.stringify(tally));
const byHost = {};
for (const [u, v] of Object.entries(res)) { const h = new URL(u).host; (byHost[h] ??= {})[v] = (byHost[h][v] ?? 0) + 1; }
console.log('BY HOST', JSON.stringify(byHost));
for (const s of sites) console.log('R', s.code, s.streams.map((x) => res[x.u]).join(','), '|', s.name);
