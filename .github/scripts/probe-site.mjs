// สำรวจกล้องเพิ่มในกรุงเทพฯ/นนทบุรี (ใช้ระหว่างพัฒนา) — อ่านเฉพาะหน้าเว็บสาธารณะ ไม่ปลอม header ไม่ล็อกอิน
// 1) ระบบกล้องจราจร กทม. ที่อยู่ใหม่ (cpudapp.bangkok.go.th/bmatraffic) — หน้าเว็บโหลดรายชื่อ/ภาพกล้องอย่างไร
// 2) กล้องกรมทางหลวงในกรุงเทพฯ/ปริมณฑลที่ตัดออกรอบก่อน — ทดสอบซ้ำแบบลองหลายครั้ง (สตรีมเริ่มเมื่อมีคนขอดู)
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('out', { recursive: true });
const flat = (s) => String(s ?? '').replace(/\s+/g, ' ');
const stage = async (name, fn) => {
  console.log(`\n========== ${name} ==========`);
  try {
    await fn();
  } catch (e) {
    console.log(`STAGE FAILED ${name}:`, String(e?.stack ?? e).slice(0, 500));
  }
};
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });

await stage('BMA traffic (new address)', async () => {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, locale: 'th-TH', ignoreHTTPSErrors: true });
  const p = await ctx.newPage();
  const bodies = [];
  p.on('response', async (r) => {
    const url = r.url();
    const rt = r.request().resourceType();
    const type = r.headers()['content-type'] ?? '';
    if (/font|stylesheet/.test(rt) || /google|gstatic|\.(woff2?|css)(\?|$)/.test(url)) return;
    if (rt === 'image' && !/show|cam|cctv|snap|jpe?g/i.test(url)) return;
    console.log('NET', r.status(), r.request().method(), rt, type.slice(0, 30), r.headers()['access-control-allow-origin'] ?? '-', url.slice(0, 200));
    if (/json|javascript|text\/(plain|html)|mpegurl/i.test(type) && rt !== 'image') {
      const t = await r.text().catch(() => '');
      bodies.push({ url, t });
      if (rt === 'xhr' || rt === 'fetch' || /mpegurl/i.test(type)) console.log('  BODY', flat(t).slice(0, 600));
    }
  });
  p.on('request', (q) => q.method() === 'POST' && console.log('POST', q.url().slice(0, 160), (q.postData() ?? '').slice(0, 200)));
  for (const u of ['https://cpudapp.bangkok.go.th/bmatraffic/', 'https://cpudapp.bangkok.go.th/']) {
    try {
      await p.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await p.waitForTimeout(12000);
      console.log('PAGE', u, '->', p.url(), '|', await p.title());
      console.log('TEXT', flat(await p.evaluate(() => document.body.innerText)).slice(0, 1500));
      console.log('LINKS', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('a[href],iframe[src],img[src],video')].map((e) => `${e.tagName}:${e.getAttribute('href') ?? e.getAttribute('src') ?? e.currentSrc}`).filter((x) => !/data:|google/.test(x)).slice(0, 60))));
      await p.screenshot({ path: `out/bma-${new URL(u).pathname.replace(/\W/g, '') || 'root'}.png` });
    } catch (e) {
      console.log('PAGE FAILED', u, String(e.message).slice(0, 160));
    }
  }
  // ข้อมูลกล้องที่ฝังในหน้า/สคริปต์ (พิกัด + รหัส)
  for (const { url, t } of bodies) {
    const coords = (t.match(/1[34]\.\d{4,}\s*,\s*100\.\d{4,}/g) ?? []).length;
    const refs = [...new Set(t.match(/["'`][^"'`\s]{0,80}(?:m3u8|show\.aspx|snapshot|camera|cctv|image\?)[^"'`\s]{0,80}["'`]/gi) ?? [])].slice(0, 20);
    if (coords > 5 || refs.length) {
      console.log(`\nDATA ${url.slice(0, 160)} len ${t.length} coords ${coords}`);
      if (refs.length) console.log('  REFS', refs.join(' '));
      const i = t.search(/1[34]\.\d{4,}\s*,\s*100\.\d{4,}/);
      if (i > 0) console.log('  AROUND', flat(t.slice(Math.max(0, i - 400), i + 400)));
      writeFileSync(`out/bma-data-${bodies.indexOf(bodies.find((x) => x.url === url))}.txt`, `${url}\n\n${t}`);
    }
  }
  await ctx.close();
});

await stage('DOH metro sites (retry like the app)', async () => {
  const sites = JSON.parse(readFileSync(new URL('./doh-sites.json', import.meta.url)));
  const codes = ['PER-3-001', 'PER-4-016', 'PER-9-028', 'PER-12-013', 'PER-19-001', 'PER-14-001', 'PER-16-012', 'PER-9-033', 'PER-3-013', 'PER-4-023', 'PER-10-024', 'PER-11-033', 'PER-12-112', 'PER-10-016', 'PER-11-015', 'PER-11-119', 'Tmp-080'];
  const urls = [...new Set(sites.filter((s) => codes.includes(s.code)).flatMap((s) => s.streams.map((x) => `${s.code} ${x.u}`)))];
  const p = await (await b.newContext()).newPage();
  await p.goto('https://example.com/', { waitUntil: 'domcontentloaded' });
  const res = await p.evaluate(async (rows) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const get = async (u) => {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 8000);
      try {
        const r = await fetch(u, { signal: ac.signal, cache: 'no-store' });
        return { s: r.status, text: r.ok ? await r.text() : '' };
      } catch (e) {
        return { s: e.name === 'AbortError' ? 'timeout' : 'blocked', text: '' };
      } finally {
        clearTimeout(t);
      }
    };
    const out = [];
    await Promise.all(rows.map(async (row) => {
      const [code, u] = row.split(' ');
      const tries = [];
      let ok = false;
      for (let k = 0; k < 6 && !ok; k++) {
        const a = await get(u);
        let step = `${a.s}`;
        if (a.s === 200 && a.text.startsWith('#EXTM3U')) {
          const next = a.text.split('\n').find((l) => l && !l.startsWith('#'));
          const c = next ? await get(new URL(next.trim(), u).href) : { s: 'none', text: '' };
          step += `/${c.s}`;
          ok = c.s === 200 && /#EXTINF/.test(c.text);
        }
        tries.push(step);
        if (!ok && typeof a.s === 'number') await sleep(3000);
        if (a.s === 'blocked') break;
      }
      out.push({ code, u, ok, tries: tries.join(',') });
    }));
    return out;
  }, urls);
  for (const r of res.sort((a, b) => a.code.localeCompare(b.code))) console.log('DOH', r.ok ? 'OK  ' : 'FAIL', r.code, r.tries, r.u.slice(8, 90));
});
await b.close();
