// สำรวจกล้องถาวรของกรมทางหลวง (highwaytraffic.go.th) ในกรุงเทพฯ ปริมณฑล ชลบุรี และจังหวัดใกล้เคียง
// อ่านรายชื่อหมุดจากหน้าเว็บสาธารณะ แล้วขอชื่อจุด/ลิงก์วิดีโอแบบเดียวกับที่หน้าเว็บทำเมื่อกดหมุด (ไม่ล็อกอิน)
// ผลลัพธ์: บรรทัด SITE {...} ต่อจุด ใช้สร้างรายชื่อกล้องของแอป
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const BASE = 'https://highwaytraffic.go.th/DOHWeb/Home.aspx';
const APP_ORIGIN = 'https://dataanalytic.precare.workers.dev';
const strip = (s) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const html = await (await fetch(BASE, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(40000) })).text();
const all = [...html.matchAll(/CreateCustomDiv\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*'([^']+)'\s*,\s*'<div id="pin(\d+)"[^>]*class="(pin\d+)"/g)].map((m) => ({ lat: Number(m[1]), lng: Number(m[2]), code: m[3], id: Number(m[4]), cls: m[5] }));
console.log('all pins', all.length, 'by prefix', JSON.stringify(all.reduce((a, s) => ((a[s.code.split('-')[0]] = (a[s.code.split('-')[0]] ?? 0) + 1), a), {})));
// กรอบ: ลุ่มเจ้าพระยาตอนล่าง + ภาคตะวันออก (ชลบุรี/สัตหีบ)
const sites = all.filter((s) => s.lat > 12.5 && s.lat < 15.4 && s.lng > 99.8 && s.lng < 101.35);
console.log('in region', sites.length);

const call = async (method, siteID) => {
  const r = await fetch(`${BASE}/${method}`, { method: 'POST', headers: { 'user-agent': UA, 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ siteID }), signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`${method} HTTP ${r.status}`);
  return (await r.json()).d;
};
const checkStream = async (url) => {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, origin: APP_ORIGIN, referer: `${APP_ORIGIN}/` }, signal: AbortSignal.timeout(12000) });
    const t = await r.text();
    return { s: r.status, cors: r.headers.get('access-control-allow-origin') ?? '-', ok: r.status === 200 && t.startsWith('#EXTM3U') };
  } catch (e) {
    return { s: 0, cors: '-', ok: false, err: String(e?.cause?.code ?? e?.name ?? e) };
  }
};

let i = 0;
const out = [];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (i < sites.length) {
    const s = sites[i++];
    const row = { ...s };
    try {
      const info = await call('GetSiteInfo', s.id);
      const text = strip(info?.[3]);
      row.name = (/ชื่อจุดติดตั้ง\s*(.*?)\s*รายละเอียด/.exec(text)?.[1] ?? '').trim();
      row.detail = (/รายละเอียด\s*(.*)$/.exec(text)?.[1] ?? '').trim().slice(0, 140);
      const cam = String(await call('GetCameraInfo', s.id));
      const streams = [...cam.matchAll(/site_code="(https:\/\/[^"]+\.m3u8)"/g)].map((m) => m[1]);
      const labels = [...cam.matchAll(/id="ctl01_tab\dLabel">([^<]*)</g)].map((m) => m[1]);
      const dirs = [...cam.matchAll(/id="ctl01_TxtDirect(?:In|Out)">([^<]*)</g)].map((m) => m[1]);
      row.streams = [];
      for (const [k, u] of streams.entries()) row.streams.push({ u, label: labels[k] ?? '', dir: dirs[k] ?? '', ...(await checkStream(u)) });
      if (!streams.length) row.note = strip(cam).slice(0, 120);
    } catch (e) {
      row.error = String(e?.message ?? e).slice(0, 100);
    }
    out.push(row);
    console.log('SITE', JSON.stringify(row));
  }
}));

const withStream = out.filter((r) => r.streams?.length);
const playable = out.filter((r) => r.streams?.some((x) => x.ok));
console.log('\nSUMMARY sites', out.length, 'with stream url', withStream.length, 'playable now', playable.length, 'errors', out.filter((r) => r.error).length);
console.log('CORS values', JSON.stringify(out.flatMap((r) => r.streams ?? []).reduce((a, x) => ((a[`${x.s}:${x.cors}`] = (a[`${x.s}:${x.cors}`] ?? 0) + 1), a), {})));
console.log('HOSTS', JSON.stringify(out.flatMap((r) => r.streams ?? []).reduce((a, x) => { const h = new URL(x.u).host; a[h] ??= { ok: 0, fail: 0 }; a[h][x.ok ? 'ok' : 'fail']++; return a; }, {})));
