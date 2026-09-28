/**
 * รายชื่อกล้อง CCTV จาก Longdo Traffic (https://traffic.longdo.com/camera)
 * ภาพกล้องมาจากมูลนิธิ iTIC ซึ่งรวมกล้องของ กทม. และกรมทางหลวง
 * แอปนำเฉพาะชื่อ/พิกัดมาปักหมุด แล้วลิงก์ไปเปิดดูภาพของกล้องตัวนั้นในหน้าเว็บ Longdo Traffic
 */
import { isServiceProvince, type Camera } from '@flood-watch/shared';

type Rec = Record<string, unknown>;

export const LONGDO_CAMERA_PAGE = 'https://traffic.longdo.com/camera';

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** ลิงก์เปิดกล้องตัวเดียว — หน้าเว็บ Longdo ย่อรหัส ITICM_BMAMI0xxx เป็น ixxx */
export function longdoCameraUrl(camid: string): string {
  const id = camid.startsWith('ITICM_BMAMI0') ? `i${camid.slice('ITICM_BMAMI0'.length)}` : camid;
  return `${LONGDO_CAMERA_PAGE}?vdo=${encodeURIComponent(id)}`;
}

/** "(กรุงเทพมหานคร) ถ.วิภาดีรังสิต ดอนเมือง  ขาออก" → "ถ.วิภาดีรังสิต ดอนเมือง ขาออก" */
function cleanTitle(title: string): string {
  return title.replace(/^\s*\([^)]*\)\s*/, '').replace(/\s+/g, ' ').trim() || title.trim();
}

export function parseLongdoCameras(body: unknown): Camera[] {
  const items = (body as Rec | null)?.item;
  if (!Array.isArray(items)) return [];
  const out: Camera[] = [];
  const seen = new Set<string>();
  for (const it of items as Rec[]) {
    const camid = str(it.camid);
    const title = str(it.title);
    const lat = Number(it.latitude);
    const lng = Number(it.longitude);
    const province = str(it.geocode)?.slice(0, 2);
    if (!camid || !title || seen.has(camid)) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) continue;
    if (!isServiceProvince(province)) continue;
    seen.add(camid);
    out.push({
      id: `longdo-${camid}`,
      name: cleanTitle(title),
      location: { lat, lng, province: province! },
      owner: str(it.organization) ?? str(it.sponsertext) ?? 'ไม่ระบุหน่วยงาน',
      url: longdoCameraUrl(camid),
      via: 'Longdo Traffic',
    });
  }
  return out;
}
