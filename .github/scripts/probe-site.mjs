// สำรวจระบบแผนที่ของเทศบาลนครนนทบุรี (MAPBOSS): ฟิลด์ทั้งหมดของชั้นข้อมูลกล้อง และแท็บติดตามสถานการณ์น้ำ
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = 'https://nkndatamap.nakornnont.go.th';
const CCTV = '8c5a386c5fbf56fcb824469410e7eb12';
mkdirSync('out', { recursive: true });
const post = async (path, body) => {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, text: await r.text() };
};

// 1) โครงสร้างฟิลด์ของชั้นข้อมูลกล้อง
const det = await (await fetch(`${BASE}/api/item/${CCTV}/details`)).text();
writeFileSync('out/cctv-details.json', det);
const d = JSON.parse(det).data;
console.log('DETAILS keys', Object.keys(d), '\nFIELDS', JSON.stringify(d.props?.fields ?? d.fields ?? d.props, null, 0).slice(0, 4000));

// 2) ข้อมูลทุกฟิลด์ของกล้อง
for (const body of [
  { format: 'geojson', rawField: true, rawValue: true, limit: 0, query: { geometry: { $ne: null } } },
  { format: 'geojson', limit: 0, query: { geometry: { $ne: null } } },
]) {
  const r = await post(`/api/item/${CCTV}/actions/query`, body);
  writeFileSync(`out/cctv-${body.rawField ? 'raw' : 'named'}.json`, r.text);
  try {
    const j = JSON.parse(r.text);
    console.log('QUERY', JSON.stringify(body).slice(0, 60), r.status, 'total', j.total);
    for (const f of j.features.slice(0, 4)) console.log('  FEATURE', JSON.stringify(f).slice(0, 900));
    const keys = {};
    for (const f of j.features) for (const [k, v] of Object.entries(f.properties)) if (v !== null && v !== '') keys[k] = (keys[k] ?? 0) + 1;
    console.log('  NONEMPTY', JSON.stringify(keys));
    const urls = j.features.flatMap((f) => Object.values(f.properties).filter((v) => typeof v === 'string' && /https?:|rtsp:|\.m3u8|\.jpg|\.png/i.test(v)));
    console.log('  URLS', urls.length, JSON.stringify(urls.slice(0, 15)));
    const names = j.features.map((f) => Object.values(f.properties).find((v) => typeof v === 'string' && /[ก-๙]/.test(v)));
    console.log('  NAMES', JSON.stringify(names.slice(0, 60)));
  } catch (e) {
    console.log('QUERY fail', r.status, r.text.slice(0, 300));
  }
}

// 3) เปิดหน้าเว็บ: แท็บติดตามสถานการณ์น้ำ และชั้นข้อมูลกล้อง
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'th-TH' })).newPage();
p.on('response', async (r) => {
  const url = r.url();
  const rt = r.request().resourceType();
  if (!/xhr|fetch|media|image/.test(rt) || /googleapis|gstatic|_next\/image/.test(url)) return;
  console.log('NET', r.status(), rt, (r.headers()['content-type'] ?? '').slice(0, 30), url.slice(0, 200));
  if (/json/.test(r.headers()['content-type'] ?? '')) console.log('  BODY', (await r.text().catch(() => '')).slice(0, 500).replace(/\s+/g, ' '));
});
p.on('request', (q) => q.method() === 'POST' && console.log('POST', q.url().slice(0, 160), (q.postData() ?? '').slice(0, 250)));
await p.goto(`${BASE}/public`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(12000);
console.log('--- click water tab');
await p.getByText('การติดตามสถานการณ์น้ำ', { exact: false }).first().click({ timeout: 5000 }).catch((e) => console.log('fail', e.message.slice(0, 100)));
await p.waitForTimeout(10000);
console.log('WATER TEXT', (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 2500));
console.log('WATER ELEMENTS', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('iframe[src],video,img[src],a[href]')].map((e) => `${e.tagName}:${e.getAttribute('src') ?? e.getAttribute('href')}`).filter((x) => !/googleapis|_next\/image|data:/.test(x)).slice(0, 60))));
await p.screenshot({ path: 'out/water.png' });
// ลองคลิกรายการแรก ๆ ในแท็บ
for (const t of (await p.$$('[class*=card], [class*=item], li, tr')).slice(0, 3)) {
  await t.click({ timeout: 2000 }).catch(() => {});
  await p.waitForTimeout(3000);
}
console.log('AFTER CLICK ELEMENTS', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('iframe[src],video,img[src]')].map((e) => `${e.tagName}:${e.getAttribute('src') ?? e.currentSrc}`).filter((x) => !/googleapis|_next\/image|data:/.test(x)).slice(0, 40))));
await p.screenshot({ path: 'out/water-after.png' });
await b.close();
