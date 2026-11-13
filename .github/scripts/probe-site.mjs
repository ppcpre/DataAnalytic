// สำรวจเว็บแหล่งข้อมูล: เปิดใน Chrome แล้วบันทึกคำขอเครือข่าย (JSON / วิดีโอ / ภาพ) เพื่อหาช่องทางดึงรายชื่อกล้อง
// ใช้: URL=https://… node probe-site.mjs
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';

const URL_ = process.env.URL;
mkdirSync('out', { recursive: true });
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'th-TH' });
const p = await ctx.newPage();
const seen = [];
let n = 0;
p.on('response', async (r) => {
  const url = r.url();
  const type = r.headers()['content-type'] ?? '';
  const rt = r.request().resourceType();
  if (/font|stylesheet/.test(rt) || /\.(woff2?|ttf|css)(\?|$)/.test(url)) return;
  if (/google|gstatic|facebook|doubleclick|openstreetmap|\/tiles?\//.test(url) && !/json/.test(type)) return;
  const row = { status: r.status(), method: r.request().method(), rt, type: type.slice(0, 40), url: url.slice(0, 220) };
  seen.push(row);
  console.log('NET', row.status, row.method, row.rt, row.type, row.url);
  if (/json|text\/plain/.test(type) || (rt === 'xhr' || rt === 'fetch')) {
    try {
      const body = await r.text();
      writeFileSync(`out/${String(++n).padStart(3, '0')}.txt`, `${url}\n\n${body}`);
      console.log('  BODY', body.slice(0, 700).replace(/\s+/g, ' '));
    } catch {}
  }
});
p.on('request', (q) => {
  if (q.method() === 'POST') console.log('POST', q.url().slice(0, 200), (q.postData() ?? '').slice(0, 300));
});
p.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text().slice(0, 200)));

await p.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(15000);
await p.screenshot({ path: 'out/page.png', fullPage: true });
console.log('TITLE', await p.title());
console.log('TEXT', (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 3000));
console.log(
  'ELEMENTS',
  JSON.stringify(
    await p.evaluate(() =>
      [...document.querySelectorAll('a[href],iframe[src],video,img[src]')]
        .map((e) => `${e.tagName}:${e.getAttribute('href') ?? e.getAttribute('src') ?? e.currentSrc}`)
        .filter((x) => !/data:/.test(x))
        .slice(0, 120),
    ),
  ),
);

// ลองคลิกเมนู/ปุ่มที่เกี่ยวกับกล้อง แล้วดูคำขอที่เกิดขึ้น
const camText = /กล้อง|CCTV|cctv|Camera/;
let clicked = 0;
for (const t of await p.$$('a, button, [role=tab], [role=button], li, label, span')) {
  const txt = ((await t.textContent().catch(() => '')) ?? '').trim();
  if (!camText.test(txt) || txt.length > 60 || clicked >= 4) continue;
  console.log('CLICK', txt);
  await t.click({ timeout: 3000 }).catch((e) => console.log('  click failed', e.message.slice(0, 80)));
  clicked++;
  await p.waitForTimeout(5000);
}

// คลิกหมุดบนแผนที่สองสามอัน
const markers = await p.$$('.leaflet-marker-icon, .maplibregl-marker, .mapboxgl-marker, gmp-advanced-marker, div[role=button][title]');
console.log('MARKERS', markers.length);
for (const m of markers.slice(0, 3)) {
  await m.click({ timeout: 3000, force: true }).catch(() => {});
  await p.waitForTimeout(4000);
  const popup = await p.evaluate(
    () => document.querySelector('.leaflet-popup, .maplibregl-popup, .mapboxgl-popup, [role=dialog], .modal.show, .gm-style-iw')?.innerHTML ?? '',
  );
  console.log('POPUP', popup.replace(/\s+/g, ' ').slice(0, 900));
}
await p.screenshot({ path: 'out/after.png', fullPage: true });
writeFileSync('out/requests.json', JSON.stringify(seen, null, 1));

// ไฟล์ JS ของเว็บ: หา endpoint ที่เขียนไว้ในโค้ด
const host = new URL(URL_).host;
const scripts = [...new Set(seen.filter((s) => s.rt === 'script' && new URL(s.url).host === host).map((s) => s.url))];
for (const s of scripts.slice(0, 8)) {
  const js = await (await fetch(s)).text().catch(() => '');
  const paths = [...new Set(js.match(/["'`](\/?(?:api|public|cctv|camera|stream|station|v\d)[^"'`\s]{2,120})["'`]/gi) ?? [])].slice(0, 60);
  const urls = [...new Set(js.match(/https?:\/\/[a-z0-9.\-:]+[^"'`\s)]{0,100}/gi) ?? [])]
    .filter((u) => !/w3\.org|reactjs|github|mozilla|schema/.test(u))
    .slice(0, 60);
  console.log('JS', s.slice(0, 120), js.length, '\n  paths', JSON.stringify(paths), '\n  urls', JSON.stringify(urls));
}
await b.close();
