// สำรวจกล้องทางหลวงของกรมทางหลวง (Highway Traffic) — หากล้องในอำเภอสัตหีบและปริมณฑล
// เปิดหน้าเว็บสาธารณะใน Chrome แล้วบันทึกคำขอที่หน้าเว็บทำเอง (ไม่ล็อกอิน ไม่เลี่ยงการควบคุมใด ๆ)
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('out', { recursive: true });
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const SITES = ['https://www.highwaytraffic.go.th/', 'https://highwaytraffic.go.th/', 'http://bmm2.doh.go.th/ems/', 'https://traffic.doh.go.th/', 'https://www.doh.go.th/'];

console.log('========== plain fetch ==========');
for (const u of SITES) {
  try {
    const r = await fetch(u, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000), redirect: 'follow' });
    const t = await r.text();
    console.log(u, '->', r.status, r.url, (r.headers.get('content-type') ?? '').slice(0, 30), t.length, '|', (t.match(/<title>[^<]*<\/title>/i) ?? [''])[0]);
  } catch (e) {
    console.log(u, '-> ERROR', String(e?.cause?.code ?? e?.name ?? e));
  }
}

// กรอบอำเภอสัตหีบ และคำที่ใช้หา
const inSattahip = (lat, lng) => lat > 12.55 && lat < 12.83 && lng > 100.82 && lng < 101.06;
const SAT_WORDS = /สัตหีบ|บางเสร่|แสมสาร|อู่ตะเภา|พลูตาหลวง|นาจอมเทียน|เขตรอุดม|Sattahip|U-?Tapao/i;
const jsonBodies = [];

const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
for (const site of SITES.slice(0, 3)) {
  console.log(`\n========== browser ${site} ==========`);
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'th-TH', ignoreHTTPSErrors: true })).newPage();
  p.on('response', async (r) => {
    const url = r.url();
    const rt = r.request().resourceType();
    const type = r.headers()['content-type'] ?? '';
    if (/font|stylesheet|image/.test(rt) || /google|gstatic|\.(woff2?|css|png|jpe?g|svg|gif)(\?|$)/i.test(url)) return;
    if (rt === 'script' && !/cctv|camera|cam/i.test(url)) return;
    console.log('NET', r.status(), r.request().method(), rt, type.slice(0, 30), url.slice(0, 180));
    if (/json|text\/plain|javascript|xml/.test(type) || rt === 'xhr' || rt === 'fetch') {
      const body = await r.text().catch(() => '');
      if (body.length > 200 && /lat|cctv|camera/i.test(body)) {
        jsonBodies.push({ url, body });
        console.log('  BODY', body.length, body.slice(0, 500).replace(/\s+/g, ' '));
      }
    }
  });
  p.on('request', (q) => q.method() === 'POST' && console.log('POST', q.url().slice(0, 160), (q.postData() ?? '').slice(0, 200)));
  try {
    await p.goto(site, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await p.waitForTimeout(15000);
    console.log('TITLE', await p.title(), '| URL', p.url());
    console.log('TEXT', (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 800));
    console.log('LINKS', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => `${a.textContent.trim().slice(0, 30)}=>${a.getAttribute('href')}`).filter((x) => /cctv|กล้อง|camera|traffic|จราจร/i.test(x)).slice(0, 30))));
    // เมนูกล้อง
    for (const t of await p.$$('a, button, li, span, div[role=button]')) {
      const txt = ((await t.textContent().catch(() => '')) ?? '').trim();
      if (/^(กล้อง|CCTV|กล้อง CCTV|กล้องจราจร)/i.test(txt) && txt.length < 30) {
        console.log('CLICK', txt);
        await t.click({ timeout: 3000 }).catch(() => {});
        await p.waitForTimeout(8000);
        break;
      }
    }
    await p.screenshot({ path: `out/${new URL(site).host}.png` });
  } catch (e) {
    console.log('FAILED', String(e?.message ?? e).slice(0, 200));
  }
  await p.close();
}
await b.close();

console.log('\n========== camera-like data ==========');
for (const { url, body } of jsonBodies) {
  writeFileSync(`out/${jsonBodies.findIndex((x) => x.url === url)}.txt`, `${url}\n\n${body}`);
  // หาคู่พิกัดในข้อความ แล้วนับจุดที่อยู่ในสัตหีบ
  const coords = [...body.matchAll(/(1[0-9]\.\d{3,})["',:\s\w]{1,40}?(1?0[0-9]\.\d{3,}|9[89]\.\d{3,})/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const sat = coords.filter(([la, ln]) => inSattahip(la, ln));
  const words = [...new Set(body.match(new RegExp(`[^"'<>{}]{0,60}(?:${SAT_WORDS.source})[^"'<>{}]{0,60}`, 'gi')) ?? [])];
  console.log(url.slice(0, 150), '| len', body.length, '| coords', coords.length, '| in Sattahip box', sat.length, JSON.stringify(sat.slice(0, 10)), '| name hits', words.length, JSON.stringify(words.slice(0, 15)));
}
