/**
 * กล้องของหน่วยงานท้องถิ่นที่เผยแพร่ผ่าน StreamBridge (เช่น https://app.streambridge.online/p/bangkruai-city)
 * หน้าเว็บดึงรายชื่อกล้องจาก /api/public/<slug> ซึ่งมีพิกัดและภาพล่าสุด (snapshot) ของแต่ละกล้อง
 */
import { isServiceProvince, type Camera } from '@flood-watch/shared';

type Rec = Record<string, unknown>;

export const STREAMBRIDGE_BASE = 'https://app.streambridge.online';
export const streamBridgeListUrl = (slug: string) => `${STREAMBRIDGE_BASE}/api/public/${encodeURIComponent(slug)}`;
export const streamBridgePage = (slug: string) => `${STREAMBRIDGE_BASE}/p/${encodeURIComponent(slug)}`;

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
/** ใช้เฉพาะ https บนโดเมนของ StreamBridge */
const ownUrl = (v: unknown) => {
  const s = str(v);
  return s?.startsWith(`${STREAMBRIDGE_BASE}/`) ? s : undefined;
};

/**
 * slug → จังหวัดของหน่วยงาน (ใช้กรองพื้นที่ให้บริการ และแสดงชื่อจังหวัด)
 * เพิ่มหน่วยงานใหม่ได้ที่นี่ และใน STREAMBRIDGE_SLUGS
 */
export const STREAMBRIDGE_PROVINCES: Record<string, { code: string; name: string }> = {
  'bangkruai-city': { code: '12', name: 'นนทบุรี' },
};

export function parseStreamBridge(body: unknown, slug: string): Camera[] {
  const b = body as Rec | null;
  const list = b?.cameras;
  if (!Array.isArray(list)) return [];
  const province = STREAMBRIDGE_PROVINCES[slug];
  if (province && !isServiceProvince(province.code)) return [];
  const owner = str(b?.subtitle) ?? str(b?.title) ?? slug;
  const out: Camera[] = [];
  for (const c of list as Rec[]) {
    const id = str(c.id);
    const name = str(c.name);
    const lat = num(c.latitude);
    const lng = num(c.longitude);
    if (!id || !name || lat === undefined || lng === undefined) continue;
    if (lat < 13.4 || lat > 14.3 || lng < 100.1 || lng > 100.95) continue;
    if (str(c.status) && c.status !== 'online') continue;
    // ภาพล่าสุดของกล้อง (อัปเดตเมื่อมีคนเปิดดูภาพสดในเว็บต้นทาง) — ?v= คือเวลาที่ถ่าย (ms)
    const thumb = ownUrl(c.thumbnail);
    const snapshot = thumb?.split('?')[0];
    const takenMs = Number(/[?&]v=(\d{12,14})/.exec(thumb ?? '')?.[1]);
    const hls = ownUrl(c.hlsUrl);
    out.push({
      id: `sb-${id}`,
      name,
      road: owner,
      location: { lat, lng, province: province?.code ?? '', ...(province ? { provinceName: province.name } : {}) },
      owner,
      url: streamBridgePage(slug),
      via: 'StreamBridge',
      ...(hls ? { hlsUrl: hls } : {}),
      ...(snapshot ? { imageUrl: snapshot } : {}),
      ...(snapshot && takenMs ? { imageTakenAt: new Date(takenMs).toISOString() } : {}),
      imageCredit: owner,
    });
  }
  return out;
}
