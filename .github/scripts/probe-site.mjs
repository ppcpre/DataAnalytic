// สำรวจกล้อง CCTV ของกรมทางหลวง (highwaytraffic.go.th) — จุดในอำเภอสัตหีบเป็นกล้องหรือไม่ และดึงภาพอย่างไร
// อ่านเฉพาะหน้าเว็บสาธารณะ (ไม่ล็อกอิน)
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const BASE = 'https://highwaytraffic.go.th';
const r = await fetch(`${BASE}/DOHWeb/Home.aspx`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(40000) });
const html = await r.text();
console.log('home', r.status, html.length);
const flat = (s) => s.replace(/\s+/g, ' ');
const around = (needle, before = 500, after = 700, max = 3) => {
  let i = -1, n = 0;
  while ((i = html.indexOf(needle, i + 1)) !== -1 && n++ < max) console.log(`\n--- "${needle}" @${i}\n${flat(html.slice(Math.max(0, i - before), i + after))}`);
  if (!n) console.log(`\n--- "${needle}" not found`);
};

console.log('\n========== how cameras are loaded ==========');
around('SiteCameraHandler', 900, 900, 2);
around('GetCameraInfo', 600, 900, 2);
around('isCamera1Start', 300, 700, 2);
around('กล้อง CCTV ช่วงเทศกาล', 600, 600, 2);

console.log('\n========== points inside Sattahip ==========');
around('12.7085324', 900, 600, 1);
around('12.7418599', 900, 600, 1);

console.log('\n========== script files ==========');
const scripts = [...new Set([...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]))];
console.log(scripts.join('\n'));
for (const s of scripts.filter((x) => !/^https?:\/\/(?!highwaytraffic)/.test(x) && !/WebResource|ScriptResource|jquery|longdo/i.test(x)).slice(0, 12)) {
  const url = new URL(s, `${BASE}/DOHWeb/`).href;
  const js = await (await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30000) })).text().catch(() => '');
  const hits = [...new Set(js.match(/[^\n;]{0,160}(?:SiteCameraHandler|GetCameraInfo|cctv|CCTV|camera_id|CameraID)[^\n;]{0,200}/g) ?? [])];
  console.log(`\nJS ${url} len ${js.length} camera refs ${hits.length}`);
  for (const h of hits.slice(0, 14)) console.log('   ', flat(h).slice(0, 360));
}

console.log('\n========== all embedded points (first fields) ==========');
// แถวข้อมูลที่มีพิกัด: พิมพ์ตัวอย่าง และรายการในชลบุรีตอนใต้
const rows = [...html.matchAll(/[^\n]{0,300}?(1[0-9]\.\d{4,})[^\d\n]{1,40}?((?:9[789]|10[0-5])\.\d{4,})[^\n]{0,300}/g)];
console.log('rows with coords', rows.length);
for (const m of rows.slice(0, 3)) console.log('  ROW', flat(m[0]).slice(0, 600));
for (const m of rows.filter((m) => Number(m[1]) > 12.5 && Number(m[1]) < 13.0 && Number(m[2]) > 100.8 && Number(m[2]) < 101.1)) console.log('  SOUTH CHONBURI', flat(m[0]).slice(0, 700));
