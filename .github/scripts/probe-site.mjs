// สำรวจแหล่งกล้องใหม่ (ใช้ระหว่างพัฒนา):
// 1) ระบบแผนที่เทศบาลนครนนทบุรี (MAPBOSS) — ฟิลด์ของชั้นข้อมูลกล้อง และแท็บติดตามสถานการณ์น้ำ
// 2) กล้องเทศบาลนครปากเกร็ด (thaiclouderp.com/CCTV_MONITOR)
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('out', { recursive: true });
const stage = async (name, fn) => {
  console.log(`\n========== ${name} ==========`);
  try {
    await fn();
  } catch (e) {
    console.log(`STAGE FAILED ${name}:`, String(e?.stack ?? e).slice(0, 600));
  }
};
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const get = async (url, init = {}) => {
  const r = await fetch(url, { ...init, headers: { 'user-agent': UA, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(30000) });
  return { status: r.status, type: r.headers.get('content-type') ?? '', text: await r.text() };
};

const NKN = 'https://nkndatamap.nakornnont.go.th';
const CCTV = '8c5a386c5fbf56fcb824469410e7eb12';

await stage('NKN cctv layer details', async () => {
  const r = await get(`${NKN}/api/item/${CCTV}/details`);
  writeFileSync('out/nkn-cctv-details.json', r.text);
  console.log(r.status, r.type, r.text.length);
  console.log(r.text.replace(/\s+/g, ' ').slice(0, 5000));
});

await stage('NKN cctv features (all fields)', async () => {
  for (const [tag, body] of [
    ['raw', { format: 'geojson', rawField: true, rawValue: true, limit: 0, query: { geometry: { $ne: null } } }],
    ['named', { format: 'geojson', limit: 0, query: { geometry: { $ne: null } } }],
  ]) {
    const r = await get(`${NKN}/api/item/${CCTV}/actions/query`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    writeFileSync(`out/nkn-cctv-${tag}.json`, r.text);
    console.log('QUERY', tag, r.status, r.type, r.text.length);
    let j;
    try {
      j = JSON.parse(r.text);
    } catch {
      console.log('  not json:', r.text.slice(0, 300));
      continue;
    }
    console.log('  total', j.total, 'features', j.features?.length);
    for (const f of (j.features ?? []).slice(0, 4)) console.log('  FEATURE', JSON.stringify(f).slice(0, 1200));
    const keys = {};
    for (const f of j.features ?? []) for (const [k, v] of Object.entries(f.properties ?? {})) if (v !== null && v !== '') keys[k] = (keys[k] ?? 0) + 1;
    console.log('  NONEMPTY', JSON.stringify(keys));
    const urls = (j.features ?? []).flatMap((f) => Object.values(f.properties ?? {}).filter((v) => typeof v === 'string' && /https?:|rtsp:|\.m3u8|\.jpe?g|\.png/i.test(v)));
    console.log('  URL-LIKE VALUES', urls.length, JSON.stringify(urls.slice(0, 15)));
  }
});

const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const watch = (p) => {
  p.on('response', async (r) => {
    const url = r.url();
    const rt = r.request().resourceType();
    const type = r.headers()['content-type'] ?? '';
    if (/font|stylesheet/.test(rt) || /maps\.googleapis|gstatic|_next\/image|\.(woff2?|css)(\?|$)/.test(url)) return;
    console.log('NET', r.status(), r.request().method(), rt, type.slice(0, 34), url.slice(0, 200));
    if (/json|mpegurl|text\/plain/i.test(type) || ((rt === 'xhr' || rt === 'fetch') && !/image|video|octet/.test(type))) {
      console.log('  BODY', (await r.text().catch(() => '')).slice(0, 700).replace(/\s+/g, ' '));
    }
  });
  p.on('requestfailed', (q) => console.log('FAILED', q.failure()?.errorText, q.url().slice(0, 160)));
  p.on('request', (q) => q.method() === 'POST' && console.log('POST', q.url().slice(0, 160), (q.postData() ?? '').slice(0, 250)));
  p.on('websocket', (ws) => console.log('WEBSOCKET', ws.url().slice(0, 200)));
};
const media = (p) =>
  p.evaluate(() =>
    [...document.querySelectorAll('iframe,video,source,img,a[href],canvas,embed,object')]
      .map((e) => `${e.tagName}:${e.getAttribute('src') ?? e.getAttribute('href') ?? e.currentSrc ?? e.getAttribute('data') ?? ''}`.slice(0, 220))
      .filter((x) => !/maps\.google|googleapis|_next\/image|data:image/.test(x))
      .slice(0, 150),
  );

await stage('NKN water tab in browser', async () => {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'th-TH' })).newPage();
  await p.goto(`${NKN}/public`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(12000);
  watch(p);
  console.log('--- click water tab');
  await p.getByText('การติดตามสถานการณ์น้ำ').first().click({ timeout: 8000 });
  await p.waitForTimeout(12000);
  console.log('TEXT', (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 2500));
  console.log('MEDIA', JSON.stringify(await media(p)));
  await p.screenshot({ path: 'out/nkn-water.png' });
  await p.close();
});

const PAKKRET = 'https://www.thaiclouderp.com/CCTV_MONITOR/web/pakkred';
await stage('PAKKRET plain fetch', async () => {
  for (const u of [PAKKRET, 'http://www.thaiclouderp.com/CCTV_MONITOR/web/pakkred', 'https://www.thaiclouderp.com/']) {
    try {
      const r = await get(u);
      console.log(u, '->', r.status, r.type, r.text.length);
      if (u === PAKKRET) {
        writeFileSync('out/pakkret.html', r.text);
        console.log(r.text.replace(/\s+/g, ' ').slice(0, 6000));
      }
    } catch (e) {
      console.log(u, '-> ERROR', String(e?.cause?.code ?? e?.name ?? e), String(e?.message ?? '').slice(0, 120));
    }
  }
});

await stage('PAKKRET in browser', async () => {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'th-TH', ignoreHTTPSErrors: true })).newPage();
  watch(p);
  await p.goto(PAKKRET, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(15000);
  console.log('TITLE', await p.title(), '| URL', p.url());
  console.log('TEXT', (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 3000));
  console.log('MEDIA', JSON.stringify(await media(p)));
  console.log('FRAMES', p.frames().map((f) => f.url().slice(0, 160)).join(' | '));
  const html = await p.content();
  writeFileSync('out/pakkret-rendered.html', html);
  console.log('INLINE URLS', JSON.stringify([...new Set(html.match(/(?:https?|rtsp|wss?):\/\/[^"'\s<>\\)]{6,160}/g) ?? [])].filter((u) => !/w3\.org|googleapis|gstatic|jquery|bootstrap|cdnjs|jsdelivr|fontawesome/.test(u)).slice(0, 80)));
  console.log('LATLNG', JSON.stringify((html.match(/1[34]\.\d{4,}\s*,\s*100\.\d{4,}|100\.\d{4,}\s*,\s*1[34]\.\d{4,}/g) ?? []).slice(0, 20)));
  await p.screenshot({ path: 'out/pakkret.png', fullPage: true });
  await p.close();
});
await b.close();
