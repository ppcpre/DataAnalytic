/**
 * กล้องถาวรของกรมทางหลวง (Highway Traffic — https://highwaytraffic.go.th)
 * รายชื่อจุด พิกัด และลิงก์วิดีโอ HLS อยู่ใน data/doh-highway.ts (สำรวจจากหน้าเว็บสาธารณะ)
 * เบราว์เซอร์เล่นวิดีโอตรงจากเซิร์ฟเวอร์ของกรมทางหลวง ไม่ผ่านและไม่เก็บไว้ที่ API ของแอป
 */
import { isCameraProvince, provinceName, type Camera } from '@flood-watch/shared';
import { DOH_SITES, type DohSite } from '../data/doh-highway.js';

export const DOH_HIGHWAY_PAGE = 'https://highwaytraffic.go.th/DOHWeb/Home.aspx';
const OWNER = 'กรมทางหลวง';
/** รับเฉพาะลิงก์วิดีโอบนเซิร์ฟเวอร์สตรีมของกรมทางหลวง */
const STREAM_URL = /^https:\/\/streaming\d\.highwaytraffic\.go\.th\/[\w-]+\/[\w.]+\/playlist\.m3u8$/;

/** "331 - สัตหีบ - เขาบายศรี" → "ทล.331 สัตหีบ - เขาบายศรี" (ชื่อที่ขึ้นต้นด้วยเลขทางหลวง) */
function displayName(name: string): string {
  const m = /^0*(\d{1,4})\s*-\s*(.+)$/.exec(name);
  return m ? `ทล.${m[1]} ${m[2].trim()}` : name;
}

export function dohHighwayCameras(sites: DohSite[] = DOH_SITES): Camera[] {
  const out: Camera[] = [];
  for (const [code, name, detail, lat, lng, province, streams] of sites) {
    const ok = streams.filter(([, , url]) => STREAM_URL.test(url));
    if (!ok.length || !isCameraProvince(province)) continue;
    const [, direction, hlsUrl] = ok[0];
    out.push({
      id: `doh-${code}`,
      name: displayName(name),
      road: [detail, ok.length === 1 ? direction : ''].filter(Boolean).join(' · ') || 'กล้องทางหลวง',
      location: { lat, lng, province, provinceName: provinceName(province) },
      owner: OWNER,
      url: DOH_HIGHWAY_PAGE,
      via: 'Highway Traffic',
      hlsUrl,
      // จุดที่มีกล้องสองทิศทาง (ขาเข้า/ขาออก)
      ...(ok.length > 1 ? { views: ok.map(([label, dir, url], i) => ({ label: label || dir || `กล้อง ${i + 1}`, hlsUrl: url })) } : {}),
      imageCredit: OWNER,
    });
  }
  return out;
}
