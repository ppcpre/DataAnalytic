// สำรวจกล้องถาวรของกรมทางหลวง (highwaytraffic.go.th) ในอำเภอสัตหีบ: กดหมุดกล้องในหน้าเว็บสาธารณะแล้วดูว่าภาพมาจากไหน
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('out', { recursive: true });
const SITE = 'https://highwaytraffic.go.th/DOHWeb/Home.aspx';
// หมุดในสัตหีบ/ใกล้เคียง: PER-16-013 (3811), PER-16-014 (3812), PER-11-030 (3291) และกล้องใน กทม. PER-3-001 (44) ไว้เทียบ
const PINS = [3811, 3812, 3291, 44];
const flat = (s) => String(s).replace(/\s+/g, ' ');

const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const p = await (await b.newContext({ viewport: { width: 1400, height: 900 }, locale: 'th-TH', ignoreHTTPSErrors: true })).newPage();
let on = false;
p.on('response', async (r) => {
  if (!on) return;
  const url = r.url();
  const rt = r.request().resourceType();
  const type = r.headers()['content-type'] ?? '';
  if (/statcounter|longdo\.com|google|\.(css|woff2?)(\?|$)/i.test(url)) return;
  console.log('NET', r.status(), r.request().method(), rt, type.slice(0, 34), (r.headers()['content-length'] ?? '-') + 'B', url.slice(0, 220));
  if (rt === 'xhr' || rt === 'fetch') console.log('  BODY', flat(await r.text().catch(() => '')).slice(0, 2500));
});
p.on('requestfailed', (q) => on && console.log('FAILED', q.failure()?.errorText, q.url().slice(0, 200)));
p.on('request', (q) => on && q.method() === 'POST' && console.log('POST', q.url().slice(0, 160), (q.postData() ?? '').slice(0, 200)));

await p.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(10000);
console.log('MoveLocation source:', flat(await p.evaluate(() => (typeof MoveLocation === 'function' ? MoveLocation.toString() : 'n/a'))).slice(0, 1800));
const fnNames = await p.evaluate(() => Object.keys(window).filter((k) => typeof window[k] === 'function' && /camera|site|location|refresh/i.test(k)).slice(0, 40));
console.log('functions', fnNames.join(', '));
for (const f of fnNames.filter((k) => /camera|OnGet|Succeed/i.test(k)).slice(0, 6)) console.log(`fn ${f}:`, flat(await p.evaluate((k) => window[k].toString(), f)).slice(0, 1500));

on = true;
for (const id of PINS) {
  console.log(`\n=========== pin ${id} ===========`);
  await p.evaluate((id) => MoveLocation(id), id).catch((e) => console.log('MoveLocation failed', String(e.message).slice(0, 120)));
  await p.waitForTimeout(12000);
  const info = await p.evaluate(() => {
    const cams = [...document.querySelectorAll('[id*=camera], video, iframe')].map((e) => ({ tag: e.tagName, id: e.id, src: e.getAttribute('src'), site_code: e.getAttribute('site_code'), gif: e.getAttribute('site_code_gif'), auto: e.getAttribute('digifort_auto_refresh'), w: e.naturalWidth ?? e.videoWidth ?? null }));
    const panel = document.querySelector('[id*=siteInfo], [id*=SiteInfo], [id*=detail], [id*=Detail]');
    return { cams, panel: (panel?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 500) };
  });
  console.log('CAMERA ELEMENTS', JSON.stringify(info.cams));
  console.log('PANEL', info.panel);
  await p.screenshot({ path: `out/pin-${id}.png` });
}
await b.close();
