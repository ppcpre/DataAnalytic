// สำรวจกล้อง CCTV ของกรมทางหลวง (highwaytraffic.go.th) — หากล้องในอำเภอสัตหีบและปริมณฑล
// เปิดหน้าเว็บสาธารณะใน Chrome กดเปิดชั้นข้อมูลกล้อง แล้วบันทึกคำขอที่หน้าเว็บทำเอง (ไม่ล็อกอิน)
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('out', { recursive: true });
const SITE = 'https://highwaytraffic.go.th/DOHWeb/Home.aspx';
const inSattahip = (lat, lng) => lat > 12.55 && lat < 12.83 && lng > 100.82 && lng < 101.06;
const SAT = /สัตหีบ|บางเสร่|แสมสาร|อู่ตะเภา|พลูตาหลวง|นาจอมเทียน|เขตรอุดม|Sattahip|U-?Tapao/i;
const bodies = [];

const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const p = await (await b.newContext({ viewport: { width: 1400, height: 900 }, locale: 'th-TH', ignoreHTTPSErrors: true })).newPage();
let logNet = false;
p.on('response', async (r) => {
  const url = r.url();
  const rt = r.request().resourceType();
  const type = r.headers()['content-type'] ?? '';
  if (/font|stylesheet/.test(rt) || /statcounter|google|gstatic|longdo\.com\/mmmap|\.(woff2?|css|svg|gif)(\?|$)/i.test(url)) return;
  if (rt === 'image' && !/cctv|cam|snapshot|jpe?g/i.test(url)) return;
  if (logNet) console.log('NET', r.status(), r.request().method(), rt, type.slice(0, 30), url.slice(0, 200));
  if (rt === 'image' || rt === 'media') return;
  const body = await r.text().catch(() => '');
  if (body.length > 100) bodies.push({ url, body, rt });
  if (logNet && rt !== 'script' && rt !== 'document') console.log('  BODY', body.length, body.slice(0, 600).replace(/\s+/g, ' '));
});
p.on('request', (q) => logNet && q.method() === 'POST' && console.log('POST', q.url().slice(0, 160), (q.postData() ?? '').slice(0, 300)));

await p.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(12000);
writeFileSync('out/home.html', await p.content());

// ตัวเลือกชั้นข้อมูลที่เกี่ยวกับกล้อง
const controls = await p.evaluate(() =>
  [...document.querySelectorAll('input, select, a, button, label, img[onclick], div[onclick], span[onclick]')]
    .map((e, i) => ({ i, tag: e.tagName, type: e.getAttribute('type'), id: e.id, name: e.getAttribute('name'), onclick: (e.getAttribute('onclick') ?? '').slice(0, 120), text: (e.textContent ?? '').trim().slice(0, 60), value: (e.getAttribute('value') ?? '').slice(0, 40) }))
    .filter((x) => /cctv|กล้อง|camera/i.test(`${x.id} ${x.name} ${x.onclick} ${x.text} ${x.value}`)),
);
console.log('CAMERA CONTROLS', JSON.stringify(controls, null, 0).slice(0, 3000));
// ฟังก์ชัน/ตัวแปรในหน้าเว็บที่เกี่ยวกับกล้อง
console.log('GLOBALS', JSON.stringify(await p.evaluate(() => Object.keys(window).filter((k) => /cctv|camera/i.test(k)).slice(0, 40))));
const html = await p.content();
console.log('INLINE cctv refs', JSON.stringify([...new Set(html.match(/[\w./?=&-]*(?:cctv|CCTV|Camera)[\w./?=&-]*/g) ?? [])].slice(0, 60)));

logNet = true;
console.log('\n--- turn on camera layers');
for (const c of controls.filter((x) => x.tag === 'INPUT' || x.onclick)) {
  const sel = c.id ? `#${CSS.escape ? c.id : c.id}` : null;
  console.log('CLICK', JSON.stringify(c).slice(0, 200));
  try {
    if (sel) await p.click(`[id="${c.id}"]`, { timeout: 4000, force: true });
    else await p.evaluate((i) => [...document.querySelectorAll('input, select, a, button, label, img[onclick], div[onclick], span[onclick]')][i].click(), c.i);
  } catch (e) {
    console.log('  click failed', String(e.message).slice(0, 100));
  }
  await p.waitForTimeout(7000);
}
// คลิกที่ข้อความของชั้นข้อมูลโดยตรงด้วย
for (const t of ['กล้อง CCTV ช่วงเทศกาลของกรมทางหลวง', 'กล้องจากระบบเตือนภัยอุบัติเหตุบน ทล 304']) {
  console.log('CLICK TEXT', t);
  await p.getByText(t, { exact: false }).first().click({ timeout: 4000 }).catch((e) => console.log('  failed', String(e.message).slice(0, 80)));
  await p.waitForTimeout(8000);
}
await p.screenshot({ path: 'out/after.png' });
console.log('MEDIA', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('img[src],iframe[src],video')].map((e) => e.getAttribute('src') ?? e.currentSrc).filter((s) => s && /cctv|cam|snapshot|stream|m3u8|mjpe?g/i.test(s)).slice(0, 30))));
await b.close();

console.log('\n========== responses mentioning cameras ==========');
let n = 0;
for (const { url, body, rt } of bodies) {
  if (!/cctv|camera|กล้อง/i.test(body) && !/cctv|camera/i.test(url)) continue;
  writeFileSync(`out/body-${++n}.txt`, `${url}\n\n${body}`);
  const coords = [...body.matchAll(/(1[0-9]\.\d{3,})[^\d]{1,40}?((?:9[789]|10[0-5])\.\d{3,})/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const sat = coords.filter(([la, ln]) => inSattahip(la, ln));
  const chon = coords.filter(([la, ln]) => la > 12.5 && la < 13.6 && ln > 100.8 && ln < 101.7);
  const hits = [...new Set(body.match(new RegExp(`[^"'<>{}\\n]{0,70}(?:${SAT.source})[^"'<>{}\\n]{0,70}`, 'gi')) ?? [])];
  const endpoints = [...new Set(body.match(/["'][\w./-]*(?:cctv|CCTV|Camera)[\w./?=&-]*["']/g) ?? [])].slice(0, 25);
  console.log(`\n${rt} ${url.slice(0, 160)} | len ${body.length} | coords ${coords.length} | chonburi-area ${chon.length} | sattahip-box ${sat.length} ${JSON.stringify(sat.slice(0, 8))}`);
  if (hits.length) console.log('  SATTAHIP NAME HITS', JSON.stringify(hits.slice(0, 20)));
  if (endpoints.length) console.log('  ENDPOINT-LIKE', endpoints.join(' '));
  if (rt !== 'script' && rt !== 'document') console.log('  SAMPLE', body.slice(0, 900).replace(/\s+/g, ' '));
}
