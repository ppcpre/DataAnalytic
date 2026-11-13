// สำรวจกล้องถาวรของกรมทางหลวง (highwaytraffic.go.th) ในกรุงเทพฯ ปริมณฑล ชลบุรี และจังหวัดใกล้เคียง
// เปิดหน้าเว็บสาธารณะใน Chrome แล้วกดหมุดทีละจุด (ฟังก์ชันเดียวกับที่หมุดเรียกเมื่อผู้ใช้คลิก) เพื่ออ่านชื่อจุดและลิงก์วิดีโอ
// จากนั้นทดสอบว่าลิงก์วิดีโอเล่นได้และอนุญาตให้เว็บอื่นเล่นหรือไม่ — ผลลัพธ์: บรรทัด SITE {...} ต่อจุด
import { chromium } from 'playwright-core';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const SITE = 'https://highwaytraffic.go.th/DOHWeb/Home.aspx';
const APP_ORIGIN = 'https://dataanalytic.precare.workers.dev';
const strip = (s) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, locale: 'th-TH', ignoreHTTPSErrors: true });
// ไม่ต้องโหลดวิดีโอจริงระหว่างเก็บรายชื่อ (ลดภาระต้นทาง)
await ctx.route(/streaming\d*\.highwaytraffic\.go\.th/, (r) => r.abort());
const p = await ctx.newPage();
const got = new Map();
let current = null;
p.on('response', async (r) => {
  const m = /Home\.aspx\/(GetSiteInfo|GetCameraInfo)$/.exec(r.url());
  if (!m) return;
  const id = JSON.parse(r.request().postData() ?? '{}').siteID ?? current;
  const d = (await r.json().catch(() => ({}))).d;
  const row = got.get(id) ?? {};
  row[m[1]] = { status: r.status(), d };
  got.set(id, row);
});
await p.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(8000);
const html = await p.content();
const all = [...html.matchAll(/CreateCustomDiv\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*'([^']+)'\s*,\s*'<div id="pin(\d+)"/g)].map((m) => ({ lat: Number(m[1]), lng: Number(m[2]), code: m[3], id: Number(m[4]) }));
const sites = all.filter((s) => s.lat > 12.5 && s.lat < 15.4 && s.lng > 99.8 && s.lng < 101.35);
console.log('all pins', all.length, 'in region', sites.length);

for (const s of sites) {
  current = s.id;
  await p.evaluate((id) => MoveLocation(id), s.id).catch(() => {});
  const t0 = Date.now();
  while (Date.now() - t0 < 5000 && !(got.get(s.id)?.GetSiteInfo && got.get(s.id)?.GetCameraInfo)) await p.waitForTimeout(200);
  const g = got.get(s.id) ?? {};
  console.log('GOT', s.code, s.id, 'info', g.GetSiteInfo?.status ?? '-', 'cam', g.GetCameraInfo?.status ?? '-', `${Date.now() - t0}ms`, [...String(g.GetCameraInfo?.d ?? '').matchAll(/site_code="([^"]+)"/g)].map((m) => m[1]).join(' '));
}
await b.close();

const checkStream = async (url) => {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, origin: APP_ORIGIN, referer: `${APP_ORIGIN}/` }, signal: AbortSignal.timeout(6000) });
    const t = await r.text();
    return { s: r.status, cors: r.headers.get('access-control-allow-origin') ?? '-', ok: r.status === 200 && t.startsWith('#EXTM3U') };
  } catch (e) {
    return { s: 0, cors: '-', ok: false, err: String(e?.cause?.code ?? e?.name ?? e) };
  }
};

const out = [];
let i = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (i < sites.length) {
    const s = sites[i++];
    const g = got.get(s.id) ?? {};
    const text = strip(g.GetSiteInfo?.d?.[3]);
    const cam = String(g.GetCameraInfo?.d ?? '');
    const row = { ...s, name: (/ชื่อจุดติดตั้ง\s*(.*?)\s*รายละเอียด/.exec(text)?.[1] ?? '').trim(), detail: (/รายละเอียด\s*(.*)$/.exec(text)?.[1] ?? '').trim().slice(0, 120), camStatus: g.GetCameraInfo?.status ?? null, streams: [] };
    const urls = [...cam.matchAll(/site_code="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
    const labels = [...cam.matchAll(/id="ctl01_tab\dLabel">([^<]*)</g)].map((m) => m[1]);
    const dirs = [...cam.matchAll(/id="ctl01_TxtDirect(?:In|Out)">([^<]*)</g)].map((m) => m[1]);
    for (const [k, u] of urls.entries()) row.streams.push({ u, label: labels[k] ?? '', dir: dirs[k] ?? '', ...(u.includes('.m3u8') ? await checkStream(u) : { ok: false, s: -1, cors: '-' }) });
    if (!urls.length) row.note = strip(cam).slice(0, 100);
    out.push(row);
  }
}));
out.sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
for (const r of out) console.log('SITE', JSON.stringify(r));

const streams = out.flatMap((r) => r.streams);
console.log('\nSUMMARY sites', out.length, '| with stream url', out.filter((r) => r.streams.length).length, '| playable now', out.filter((r) => r.streams.some((x) => x.ok)).length);
console.log('CORS', JSON.stringify(streams.reduce((a, x) => ((a[`${x.s}:${x.cors}${x.err ? `:${x.err}` : ''}`] = (a[`${x.s}:${x.cors}${x.err ? `:${x.err}` : ''}`] ?? 0) + 1), a), {})));
console.log('HOSTS', JSON.stringify(streams.reduce((a, x) => { const h = new URL(x.u).host; a[h] ??= { ok: 0, fail: 0 }; a[h][x.ok ? 'ok' : 'fail']++; return a; }, {})));
