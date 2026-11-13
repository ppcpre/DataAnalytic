// ตรวจกล้องทุกตัวบนเว็บที่ deploy แล้ว: (1) ลิงก์ภาพ/วิดีโอของทุกกล้องตอบจริงหรือไม่ (2) เปิดหน้าต่างกล้องใน Chrome จริงแล้วภาพขึ้นหรือไม่
// ใช้: BASE=https://… SAMPLE=6 node camera-check.mjs   (ต้องมี playwright-core และ Chrome ที่ /usr/bin/google-chrome)
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const BASE = (process.env.BASE ?? 'https://dataanalytic.precare.workers.dev').replace(/\/$/, '');
const SAMPLE = Number(process.env.SAMPLE ?? 6);
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const abs = (u) => (u.startsWith('/') ? BASE + u : u);
const group = (c) => {
  const g = c.id.replace(/^(rs-cam|rs-rep|pop-c|pop-r|pakkret-eon)[-_]?.*$/, '$1').replace(/^([a-z]+)-.*$/, '$1');
  // Longdo/iTIC: แยกกล้องที่มีวิดีโอ HLS กับที่มีแต่ภาพนิ่ง/MJPEG
  return g === 'longdo' ? (c.hlsUrl ? 'longdo-hls' : 'longdo-img') : g;
};

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

/** ดึงส่วนต้นของ URL (ไม่โหลดทั้งหมด เพราะ MJPEG ไม่มีวันจบ) */
async function head(url, ms = 15000, init = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  const t0 = Date.now();
  try {
    const r = await fetch(url, { ...init, signal: ac.signal, headers: { 'user-agent': UA, ...(init.headers ?? {}) }, redirect: 'follow' });
    const type = r.headers.get('content-type') ?? '';
    let bytes = 0; let text = '';
    const reader = r.body?.getReader();
    if (reader) {
      while (bytes < 4096) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (text.length < 400) text += Buffer.from(value).toString('latin1');
      }
      ac.abort();
    }
    return { status: r.status, type, bytes, text, ms: Date.now() - t0 };
  } catch (e) {
    return { status: 0, type: '', bytes: 0, text: '', err: (e.cause?.code ?? e.name ?? String(e)).toString(), ms: Date.now() - t0 };
  } finally { clearTimeout(t); }
}

const verdict = (kind, r) => {
  if (r.status !== 200) return `HTTP ${r.status}${r.err ? ` ${r.err}` : ''}`;
  if (kind === 'hls' || kind === 'viewhls') return r.text.startsWith('#EXTM3U') ? 'ok' : `not m3u8 (${r.type})`;
  if (kind === 'session') return /"hlsUrl"\s*:\s*"https:/.test(r.text) ? 'ok' : `no hlsUrl: ${r.text.slice(0, 80)}`;
  if (kind === 'page') return 'ok';
  if (!/image|multipart|video|octet/.test(r.type)) return `type ${r.type || '?'} ${r.text.slice(0, 60).replace(/\s+/g, ' ')}`;
  if (r.bytes < 800) return `tiny ${r.bytes}B`;
  return 'ok';
};

const res = await fetch(`${BASE}/api/cameras`, { headers: { 'user-agent': UA } });
const body = await res.json();
// ONLY_GROUPS=doh,sb จำกัดการตรวจเฉพาะบางแหล่ง; EXTRA_IDS=id1,id2 เปิดกล้องเหล่านี้ใน Chrome เพิ่มจากตัวอย่าง
const ONLY = (process.env.ONLY_GROUPS ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const EXTRA = (process.env.EXTRA_IDS ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const cams = (body.data ?? []).filter((c) => !ONLY.length || ONLY.includes(group(c)));
console.log(`cameras HTTP ${res.status} count=${cams.length} source=${body.source} stale=${body.stale} error=${body.error ?? '-'}`);

// ---------- 1) ตรวจลิงก์ของทุกกล้อง ----------
const linkResults = await pool(cams, 24, async (c) => {
  const checks = [];
  if (c.hlsUrl) checks.push(['hls', c.hlsUrl]);
  if (c.hlsSessionUrl) checks.push(['session', c.hlsSessionUrl]);
  if (c.streamUrl) checks.push(['mjpeg', c.streamUrl]);
  if (c.videoUrl) checks.push(['clip', c.videoUrl]);
  if (c.imageUrl) checks.push(['still', c.imageUrl]);
  for (const v of (c.views ?? []).slice(1)) checks.push(v.hlsUrl ? ['viewhls', v.hlsUrl] : ['view', v.imageUrl]);
  if (c.embedUrl) checks.push(['page', c.embedUrl]);
  const out = {};
  for (const [kind, url] of checks) {
    if (!url) continue;
    const r = await head(abs(url), kind === 'session' ? 25000 : 15000);
    out[kind.startsWith('view') ? `view:${url.slice(-36)}` : kind] = { v: verdict(kind, r), status: r.status, type: r.type, bytes: r.bytes, ms: r.ms, url: abs(url).slice(0, 140) };
  }
  return { id: c.id, g: group(c), name: c.name, owner: c.owner, kind: c.kind ?? 'traffic', checks: out, none: checks.length === 0 };
});

const groups = {};
for (const r of linkResults) {
  const g = (groups[r.g] ??= { total: 0, noMedia: 0, anyOk: 0, byKind: {}, failEx: [] });
  g.total++;
  if (r.none) g.noMedia++;
  const oks = Object.values(r.checks).filter((x) => x.v === 'ok').length;
  if (oks) g.anyOk++;
  for (const [k, x] of Object.entries(r.checks)) {
    const kk = k.startsWith('view:') ? 'view' : k;
    const b = (g.byKind[kk] ??= { ok: 0, fail: 0, reasons: {} });
    if (x.v === 'ok') b.ok++; else { b.fail++; b.reasons[x.v] = (b.reasons[x.v] ?? 0) + 1; }
  }
  if (!oks && g.failEx.length < 4) g.failEx.push({ id: r.id, name: r.name, checks: r.checks });
}
console.log('\n===== LINK CHECK BY SOURCE =====');
for (const [g, s] of Object.entries(groups)) {
  console.log(`\n## ${g}: total=${s.total} anyMediaOk=${s.anyOk} noMediaFields=${s.noMedia}`);
  for (const [k, b] of Object.entries(s.byKind)) console.log(`   ${k.padEnd(8)} ok=${b.ok} fail=${b.fail} ${JSON.stringify(b.reasons)}`);
  for (const ex of s.failEx) console.log(`   FAIL-EX ${ex.id} ${ex.name} ${JSON.stringify(ex.checks)}`);
}

// ---------- 1b) ตรวจต้นทางโดยตรง (แยกปัญหาของต้นทางกับของ API แอป) ----------
console.log('\n===== UPSTREAM DIRECT =====');
const placeholder = cams.filter((c) => /X\.X\.X\.X/.test(`${c.streamUrl ?? ''}${c.imageUrl ?? ''}`));
console.log(`longdo placeholder camid (X.X.X.X) in stream/image url: ${placeholder.length}`, placeholder.slice(0, 5).map((c) => c.id).join(' '));
for (const c of cams.filter((c) => c.id.startsWith('dwr-')).slice(0, 4)) {
  const code = c.id.slice(4);
  const r = await head(`https://telemetry.dwr.go.th/cctv/mjpeg/${code}`, 12000);
  console.log('DWR mjpeg direct', code, r.status, r.type, r.bytes, r.err ?? '', r.text.slice(0, 80).replace(/[^\x20-\x7e]/g, '.'));
  const a = await head(abs(`/api/dwr/live?code=${code}`), 12000);
  console.log('DWR mjpeg via app', code, a.status, a.type, a.text.slice(0, 120));
}
// นนทบุรี: ตรวจทีละตัว (ไม่ยิงพร้อมกัน) เทียบกับผลรอบแรกที่ยิงพร้อมกันหลายตัว
const nontUrls = cams.filter((c) => c.id.startsWith('nont-')).flatMap((c) => (c.views?.length ? c.views.map((v) => v.imageUrl) : c.imageUrl ? [c.imageUrl] : []).map((u) => [c.id, u]));
const nontSeq = {};
for (const [id, u] of nontUrls) {
  const r = await head(abs(u), 20000);
  const v = verdict('still', r);
  nontSeq[v] = (nontSeq[v] ?? 0) + 1;
  if (v !== 'ok') console.log('NONT seq fail', id, decodeURIComponent(u.split('cam=')[1] ?? ''), v, `${r.ms}ms`, r.text.slice(0, 100));
}
console.log('NONT sequential', JSON.stringify(nontSeq));
const nd = await head('http://182.52.224.70/json.php?app=station', 15000);
console.log('NONT direct station list', nd.status, nd.type, nd.err ?? '', `${nd.ms}ms`);

// ---------- 2) เปิดหน้าต่างกล้องใน Chrome ----------
const byGroup = {};
for (const c of cams) (byGroup[group(c)] ??= []).push(c);
const sample = [];
for (const list of Object.values(byGroup)) {
  const step = Math.max(1, Math.floor(list.length / SAMPLE));
  for (let i = 0; i < list.length && sample.filter((c) => group(c) === group(list[0])).length < SAMPLE; i += step) sample.push(list[i]);
}

for (const id of EXTRA) { const c = cams.find((x) => x.id === id); if (c && !sample.includes(c)) sample.push(c); }
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA.replace('X11; Linux x86_64', 'Linux; Android 14; Pixel 8') + ' Mobile' });
async function newAppPage() {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 200)));
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.pin-camera', { timeout: 60000 });
  await p.waitForTimeout(3000);
  return p;
}
const pages = await Promise.all(Array.from({ length: 4 }, newAppPage));
console.log('\n===== BROWSER (pins on map:', await pages[0].locator('.pin-camera').count(), ') =====');

// แต่ละ worker ใช้แท็บของตัวเอง (กันผลของกล้องหนึ่งไปปนกับอีกตัว)
const queue = [...sample];
const uiResults = [];
await Promise.all(pages.map(async (p) => {
  while (queue.length) uiResults.push(await openOne(p, queue.shift()));
}));
async function openOne(p, c) {
  const failed = [];
  const onFail = (r) => failed.push(`${r.failure()?.errorText} ${r.url().slice(0, 90)}`);
  const onResp = (r) => { if (r.status() >= 400) failed.push(`HTTP ${r.status()} ${r.url().slice(0, 90)}`); };
  p.on('requestfailed', onFail); p.on('response', onResp);
  const opened = await p.evaluate((id) => {
    let b = document.querySelector(`[data-open="camera:${CSS.escape(id)}"]`);
    if (!b) { b = document.createElement('button'); b.dataset.open = `camera:${id}`; (document.querySelector('#water-cams ul') ?? document.body).appendChild(b); }
    b.click();
    return !document.getElementById('sheet').hidden;
  }, c.id);
  let st = null; const t0 = Date.now();
  while (Date.now() - t0 < 70000) {
    await p.waitForTimeout(1500);
    st = await p.evaluate(() => {
      const s = document.getElementById('sheet');
      const v = s.querySelector('.cam-view');
      const img = s.querySelector('.cam-media img'); const vid = s.querySelector('.cam-media video');
      return { title: s.querySelector('.sheet-title')?.textContent, hasView: !!v, mode: v?.dataset.mode, label: s.querySelector('[data-cam-label]')?.textContent, img: img ? img.naturalWidth : null, video: vid ? { w: vid.videoWidth, t: +vid.currentTime.toFixed(1), err: vid.error?.code } : null, iframe: !!s.querySelector('.cam-media iframe'), link: s.querySelector('a.btn-primary')?.getAttribute('href')?.slice(0, 90) };
    });
    if (!st.hasView || (st.mode && st.mode !== 'loading')) break;
  }
  st.secs = Math.round((Date.now() - t0) / 1000);
  const shot = `shot-${c.id.replace(/[^a-z0-9-]/gi, '_').slice(0, 40)}.png`;
  if (!st.hasView || st.mode === 'off') await p.screenshot({ path: shot });
  p.off('requestfailed', onFail); p.off('response', onResp);
  await p.evaluate(() => document.querySelector('#sheet [data-close]')?.click());
  await p.waitForTimeout(500);
  const line = { id: c.id, g: group(c), name: c.name, opened, ...st, failed: [...new Set(failed)].slice(0, 4) };
  console.log('UI', JSON.stringify(line));
  return line;
}
await browser.close();

console.log('\n===== BROWSER SUMMARY =====');
const sum = {};
for (const r of uiResults) {
  const s = (sum[r.g] ??= {});
  const key = !r.opened ? 'sheet-not-open' : !r.hasView ? 'no-viewer' : r.mode;
  s[key] = (s[key] ?? 0) + 1;
}
for (const [g, s] of Object.entries(sum)) console.log(`${g.padEnd(12)} ${JSON.stringify(s)}`);
writeFileSync('report.json', JSON.stringify({ base: BASE, at: new Date().toISOString(), groups, links: linkResults, ui: uiResults }, null, 1));
