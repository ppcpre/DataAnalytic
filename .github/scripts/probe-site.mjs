// สำรวจแหล่งกล้องเพิ่ม (ใช้ระหว่างพัฒนา) — เรียกเฉพาะหน้าที่เปิดสาธารณะ ไม่ต้องล็อกอิน
// 1) Longdo/iTIC: กล้องในแต่ละจังหวัด/อำเภอ (รวมสัตหีบ) และกล้องที่แอปยังไม่ได้แสดง
// 2) StreamBridge: มีหน่วยงานอื่นนอกจากเทศบาลเมืองบางกรวยหรือไม่
// 3) กรมทรัพยากรน้ำ: สถานีที่มีกล้องในชลบุรี
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const get = async (url, init = {}) => {
  const r = await fetch(url, { ...init, headers: { 'user-agent': UA, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(30000) });
  return { status: r.status, type: r.headers.get('content-type') ?? '', text: await r.text() };
};
const stage = async (name, fn) => {
  console.log(`\n========== ${name} ==========`);
  try {
    await fn();
  } catch (e) {
    console.log(`STAGE FAILED ${name}:`, String(e?.stack ?? e).slice(0, 400));
  }
};
const PROV = { 10: 'กรุงเทพฯ', 11: 'สมุทรปราการ', 12: 'นนทบุรี', 13: 'ปทุมธานี', 73: 'นครปฐม', 74: 'สมุทรสาคร', 20: 'ชลบุรี', 24: 'ฉะเชิงเทรา', 14: 'อยุธยา' };

await stage('LONGDO camera list by province / district', async () => {
  const r = await get('https://traffic.longdo.com/camera.json');
  const items = JSON.parse(r.text).item ?? [];
  console.log('total cameras', items.length, 'fields', Object.keys(items[0] ?? {}).join(','));
  const byProv = {};
  for (const it of items) {
    const g = String(it.geocode ?? '');
    const p = g.slice(0, 2);
    (byProv[p] ??= []).push(it);
  }
  console.log('BY PROVINCE', JSON.stringify(Object.fromEntries(Object.entries(byProv).map(([p, l]) => [`${p}${PROV[p] ? ` ${PROV[p]}` : ''}`, l.length]))));
  for (const p of Object.keys(PROV)) {
    const list = byProv[p] ?? [];
    const amp = {};
    for (const it of list) {
      const a = String(it.geocode).slice(0, 4);
      const e = (amp[a] ??= { n: 0, hls: 0, ex: [] });
      e.n++;
      if (String(it.hls_url ?? '').startsWith('https://')) e.hls++;
      if (e.ex.length < 2) e.ex.push(String(it.title).slice(0, 50));
    }
    console.log(`\n${p} ${PROV[p]}: ${list.length}`);
    for (const [a, e] of Object.entries(amp).sort()) console.log(`   amphoe ${a}: ${e.n} cams (hls ${e.hls}) e.g. ${e.ex.join(' | ')}`);
  }
  // สัตหีบ: รหัสอำเภอ 2009 หรือพิกัดในกรอบอำเภอ หรือชื่อมีคำว่าสัตหีบ/บางเสร่/แสมสาร/อู่ตะเภา
  const sat = items.filter((it) => {
    const lat = Number(it.latitude), lng = Number(it.longitude);
    return String(it.geocode).startsWith('2009') || /สัตหีบ|บางเสร่|แสมสาร|อู่ตะเภา|นาจอมเทียน|พลูตาหลวง|Sattahip/i.test(String(it.title)) || (lat > 12.55 && lat < 12.82 && lng > 100.82 && lng < 101.05);
  });
  console.log('\nSATTAHIP candidates', sat.length);
  for (const it of sat) console.log('  ', JSON.stringify({ camid: it.camid, title: it.title, lat: it.latitude, lng: it.longitude, geocode: it.geocode, org: it.organization, hls: it.hls_url, link: it.link }).slice(0, 400));
  // ชลบุรีตอนใต้ (พัทยา-สัตหีบ) เรียงตามละติจูด เพื่อดูว่ากล้องใต้สุดอยู่ที่ไหน
  const south = (byProv['20'] ?? []).map((it) => ({ t: String(it.title).slice(0, 44), lat: Number(it.latitude), lng: Number(it.longitude) })).sort((a, b) => a.lat - b.lat).slice(0, 8);
  console.log('CHONBURI southernmost', JSON.stringify(south));
});

await stage('STREAMBRIDGE other agencies', async () => {
  const home = await get('https://app.streambridge.online/');
  console.log('home', home.status, home.type, home.text.length);
  const assets = [...new Set(home.text.match(/\/(?:assets|_next|static)\/[^"' )]+\.js/g) ?? [])];
  console.log('assets', assets.slice(0, 6).join(' '));
  for (const path of ['/api/public', '/api/public/', '/api/public/list', '/api/public/tenants', '/api/public/organizations', '/p', '/sitemap.xml', '/robots.txt']) {
    const r = await get(`https://app.streambridge.online${path}`).catch((e) => ({ status: 0, type: String(e), text: '' }));
    console.log(path, '->', r.status, r.type.slice(0, 30), r.text.slice(0, 200).replace(/\s+/g, ' '));
  }
  // หน้าสาธารณะของหน่วยงานใช้รูปแบบ /p/<ชื่อหน่วยงาน> — ลองชื่อเทศบาลในปริมณฑลและชลบุรี
  const names = ['bangkruai', 'nonthaburi', 'nakornnont', 'pakkret', 'pakkred', 'bangbuathong', 'bangyai', 'saima', 'plaibang', 'bangsrimuang', 'rangsit', 'pathumthani', 'thanyaburi', 'khlongluang', 'lamlukka', 'bangkadi', 'samutprakan', 'paknam', 'bangpu', 'bangkaeo', 'phrapradaeng', 'bangphli', 'nakhonpathom', 'samphran', 'raikhing', 'krathumlom', 'omnoi', 'samutsakhon', 'krathumbaen', 'sattahip', 'bansattahip', 'bangsaray', 'khetudomsak', 'najomtien', 'pattaya', 'chonburi', 'sriracha', 'laemchabang', 'saensuk', 'banglamung', 'nongprue', 'bma', 'bangkok'];
  const suffixes = ['', '-city', '-town', '-municipality', '-subdistrict'];
  const found = [];
  const slugs = names.flatMap((n) => suffixes.map((s) => n + s));
  let i = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < slugs.length) {
      const slug = slugs[i++];
      const r = await get(`https://app.streambridge.online/api/public/${slug}`).catch(() => null);
      if (!r || r.status !== 200) continue;
      try {
        const j = JSON.parse(r.text);
        if (Array.isArray(j.cameras)) found.push({ slug, title: j.title, subtitle: j.subtitle, cameras: j.cameras.length, online: j.cameras.filter((c) => c.status === 'online').length, withCoords: j.cameras.filter((c) => typeof c.latitude === 'number').length, sample: j.cameras.slice(0, 3).map((c) => c.name) });
      } catch {}
    }
  }));
  console.log('tried', slugs.length, 'slugs; FOUND', found.length);
  for (const f of found) console.log('  ', JSON.stringify(f));
});

await stage('DWR stations with cameras in Chonburi / metro', async () => {
  const r = await get('https://telemetry.dwr.go.th/api/public/reportCctv/listPaginate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paginate: { page: 1, pageSize: 500, orders: [{ key: 'MAIN_BASIN', desc: false }] }, search: {} }),
  });
  const rows = JSON.parse(r.text).value?.results ?? [];
  const by = {};
  for (const x of rows) (by[x.provinceNameTh] ??= []).push(`${x.entity?.stnNameTh} (${x.districtNameTh})`);
  for (const p of ['ชลบุรี', 'กรุงเทพมหานคร', 'นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ', 'นครปฐม', 'สมุทรสาคร', 'ระยอง']) console.log(p, (by[p] ?? []).length, JSON.stringify((by[p] ?? []).slice(0, 12)));
});
