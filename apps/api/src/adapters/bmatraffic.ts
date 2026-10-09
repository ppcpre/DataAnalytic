/**
 * กล้อง CCTV จราจรของกรุงเทพมหานคร (สำนักการจราจรและขนส่ง) — http://www.bmatraffic.com
 * หน้าแรกฝังรายชื่อกล้องพร้อมพิกัดไว้ในตัวแปร `var locations = [[id, ชื่อ, ชื่ออังกฤษ, ตำแหน่ง, ทิศทาง, lat, lng, ip, ไอคอน], …]`
 * ภาพล่าสุดของกล้อง: /show.aspx?image=<id> (หน้า PlayVideo.aspx ของต้นทางโหลดภาพนี้ใหม่ทุก 1 วินาที)
 *
 * ต.ค. 2569 เว็บประกาศ "ปิดปรับปรุงระบบชั่วคราว" และ show.aspx ส่งภาพขาวล้วน (PNG ~1.4 KB) ทุกกล้อง
 * แอปจึงสุ่มตรวจภาพก่อน แสดงกล้องชุดนี้เฉพาะเมื่อต้นทางส่งภาพจริง (JPEG) กลับมาแล้ว
 * ต้นทางมีแต่ http — ภาพต้องผ่าน /api/bma/image (browser ไม่แสดงภาพ http ในหน้า https)
 */
import type { Camera } from '@flood-watch/shared';

export const BMA_TRAFFIC_HOST = 'www.bmatraffic.com';
export const BMA_TRAFFIC_BASE = `http://${BMA_TRAFFIC_HOST}`;
export const BMA_TRAFFIC_PAGE = `${BMA_TRAFFIC_BASE}/`;
const OWNER = 'กรุงเทพมหานคร (สจส.)';
/** รหัสกล้องของต้นทาง (ตัวเลข) */
export const BMA_CAM_ID = /^\d{1,6}$/;

export const bmaImagePath = (id: string) => `/show.aspx?image=${id}&&time=${Date.now()}`;
export const bmaViewerUrl = (id: string) => `${BMA_TRAFFIC_BASE}/PlayVideo.aspx?ID=${id}`;

/** ข้อความในเครื่องหมาย '…' ของ JavaScript (รองรับ \' และ \\) */
const jsString = String.raw`'((?:[^'\\]|\\.)*)'`;
const ROW = new RegExp(
  String.raw`\[\s*${jsString}\s*,\s*${jsString}\s*,\s*${jsString}\s*,\s*${jsString}\s*,\s*${jsString}\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)`,
  'g',
);
const clean = (s: string) => s.replace(/\\(.)/g, '$1').replace(/\s+/g, ' ').trim();

export function parseBmaTraffic(html: string): Camera[] {
  const at = html.indexOf('var locations = [');
  if (at < 0) return [];
  const end = html.indexOf('];', at);
  const block = html.slice(at, end < 0 ? undefined : end + 1);
  const out: Camera[] = [];
  const seen = new Set<string>();
  for (const m of block.matchAll(ROW)) {
    // ช่องที่ 5 เป็นทิศทางภาษาอังกฤษ จึงไม่ใช้
    const [, id, rawName, , rawPlace, , latS, lngS] = m;
    const lat = Number(latS);
    const lng = Number(lngS);
    if (!BMA_CAM_ID.test(id) || seen.has(id) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < 13.4 || lat > 14.1 || lng < 100.2 || lng > 101) continue;
    seen.add(id);
    // ชื่อมักขึ้นต้นด้วยรหัสโครงการ เช่น "TF1-PC-02 ถนนเพชรเกษม …" → ตัดรหัสออก
    const name = clean(rawName).replace(/^[A-Z]{1,4}\d*(?:-[A-Z0-9]{1,4}){1,3}\s+/, '') || clean(rawPlace) || `กล้อง ${id}`;
    out.push({
      id: `bma-${id}`,
      name,
      road: 'กล้องจราจร กทม.',
      location: { lat, lng, province: '10', provinceName: 'กรุงเทพมหานคร' },
      owner: OWNER,
      url: bmaViewerUrl(id),
      imageUrl: `/api/bma/image?id=${id}`,
      imageCredit: OWNER,
    });
  }
  return out;
}

/**
 * ภาพที่ได้จาก show.aspx เป็นภาพกล้องจริงหรือไม่
 * ขณะต้นทางปิดปรับปรุงจะได้ PNG ขาวล้วนขนาด ~1.4 KB — ภาพจริงเป็น JPEG ขนาดหลาย KB
 */
export function isRealBmaFrame(body: Uint8Array): boolean {
  return body.byteLength > 4000 && body[0] === 0xff && body[1] === 0xd8;
}
