/**
 * ระดับน้ำคลองและน้ำท่วมถนนของกรุงเทพมหานคร ผ่าน POPNIX Flood (https://flood.pop.in.th/api/)
 * POPNIX นำข้อมูลจุดวัดของสำนักการระบายน้ำ กทม. มาจัดรูปแบบ และเปิดให้ใช้ฟรีโดยต้องให้เครดิต
 * เงื่อนไข: ให้เครดิตใกล้ข้อมูลและลิงก์กลับ, ไม่ใช่ประกาศเตือนภัยทางการ, ดึงผ่าน server แล้ว cache (300 ครั้ง/นาที/IP)
 * - GET /api_overview.php: ระดับน้ำคลองทุกจุดวัด (ม.รทก.) พร้อมเกณฑ์เฝ้าระวัง/วิกฤต
 * - GET /api_roads.php: ความลึกน้ำบนถนนและอุโมงค์ (ซม.)
 * - GET /api_history.php?id=&h=: ระดับน้ำย้อนหลังของจุดวัดคลอง
 */
import type { Camera, CameraReading } from '@flood-watch/shared';

type Rec = Record<string, unknown>;

export const POPNIX_BASE = 'https://flood.pop.in.th';
export const POPNIX_CANALS_URL = `${POPNIX_BASE}/api_overview.php`;
export const POPNIX_ROADS_URL = `${POPNIX_BASE}/api_roads.php`;
/** ช่วงเวลาที่ api_history รองรับ (ชั่วโมง) */
const HISTORY_HOURS = [24, 72, 168, 720];
export const popnixHistoryUrl = (id: string, hours: number) =>
  `${POPNIX_BASE}/api_history.php?id=${encodeURIComponent(id)}&h=${HISTORY_HOURS.find((h) => h >= hours) ?? 168}`;
/** รหัสจุดวัดคลอง (ตัวเลข) */
export const POPNIX_CANAL_ID = /^\d{1,6}$/;
/** ข้อความเครดิตที่ต้องแสดงตามเงื่อนไขของ POPNIX Flood */
export const POPNIX_ATTRIBUTION = 'ข้อมูล: สำนักการระบายน้ำ กรุงเทพมหานคร ผ่าน POPNIX Flood (flood.pop.in.th) — ไม่ใช่ประกาศเตือนภัยทางการ';
const OWNER = 'สำนักการระบายน้ำ กทม.';

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const inBangkok = (lat: number, lng: number) => lat >= 13.45 && lat <= 14.1 && lng >= 100.3 && lng <= 100.95;

/** "2026-10-21 18:35:00" (เวลาไทย ไม่มีเขตเวลา) → ISO */
export function popnixTime(v: unknown): string | undefined {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?$/.exec(str(v) ?? '');
  if (!m) return undefined;
  const d = new Date(`${m[1]}T${m[2]}:${m[3] ?? '00'}+07:00`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

const common = { owner: OWNER, url: `${POPNIX_BASE}/`, via: 'POPNIX Flood', attribution: POPNIX_ATTRIBUTION, kind: 'water' as const };

/** จุดวัดระดับน้ำคลองที่ส่งค่าอยู่ (online) */
export function parsePopnixCanals(body: unknown): Camera[] {
  const list = (body as Rec | null)?.stations;
  if (!Array.isArray(list)) return [];
  const out: Camera[] = [];
  for (const s of list as Rec[]) {
    const id = num(s.id);
    const name = str(s.name);
    const lat = num(s.lat);
    const lng = num(s.lng);
    const wl = num(s.wl);
    if (id === undefined || !Number.isInteger(id) || !name || lat === undefined || lng === undefined || !inBangkok(lat, lng)) continue;
    if (s.online !== true || wl === undefined) continue;
    const warn = num(s.warn);
    const crit = num(s.crit);
    const reading: CameraReading = {
      label: 'ระดับน้ำคลอง (ม.รทก.)',
      value: wl,
      unit: 'ม.',
      // ใช้เกณฑ์เมื่อสมเหตุสมผล (เฝ้าระวังต่ำกว่าวิกฤต)
      ...(warn !== undefined && (crit === undefined || warn <= crit) ? { warning: warn } : {}),
      ...(crit !== undefined ? { danger: crit } : {}),
      historyId: `pop-c${id}`,
    };
    out.push({
      ...common,
      id: `pop-c${id}`,
      name,
      road: [str(s.river), 'จุดวัดระดับน้ำคลอง กทม.'].filter(Boolean).join(' · '),
      location: { lat, lng, province: '10', provinceName: 'กรุงเทพมหานคร' },
      readings: [reading],
      ...(popnixTime(s.measured_at) ? { observedAt: popnixTime(s.measured_at) } : {}),
    });
  }
  return out;
}

/**
 * จุดวัดน้ำท่วมถนน/อุโมงค์ — ปักหมุดเฉพาะจุดที่มีน้ำ (ต้นทางจัดระดับ slight 5–10 ซม., flood เกิน 10 ซม.)
 * จุดที่แห้งมีกว่า 200 จุด จึงไม่ปักเพื่อไม่ให้แผนที่รก
 */
export function parsePopnixRoads(body: unknown): Camera[] {
  const list = (body as Rec | null)?.roads;
  if (!Array.isArray(list)) return [];
  const out: Camera[] = [];
  for (const r of list as Rec[]) {
    const code = str(r.code);
    const name = str(r.name);
    const lat = num(r.lat);
    const lng = num(r.lng);
    const depth = num(r.depth);
    if (!code || !/^[A-Z0-9.]{3,20}$/.test(code) || !name || lat === undefined || lng === undefined || !inBangkok(lat, lng)) continue;
    if ((r.level !== 'flood' && r.level !== 'slight') || depth === undefined) continue;
    const tunnel = r.kind === 2;
    out.push({
      ...common,
      id: `pop-r${code}`,
      name,
      road: [tunnel ? 'อุโมงค์' : str(r.road), str(r.district) ? `เขต${str(r.district)}` : undefined, 'น้ำท่วมถนน'].filter(Boolean).join(' · '),
      location: { lat, lng, province: '10', provinceName: 'กรุงเทพมหานคร' },
      readings: [{ label: tunnel ? 'ความลึกน้ำในอุโมงค์' : 'ความลึกน้ำบนถนน', value: depth / 100, unit: 'ม.', warning: 0.05, danger: 0.1 }],
      ...(popnixTime(r.measured_at) ? { observedAt: popnixTime(r.measured_at) } : {}),
    });
  }
  return out;
}

/** ระดับน้ำย้อนหลังของจุดวัดคลอง */
export function parsePopnixHistory(body: unknown): Array<{ t: number; level: number }> {
  const points = (body as Rec | null)?.points;
  if (!Array.isArray(points)) return [];
  const out: Array<{ t: number; level: number }> = [];
  for (const p of points as Rec[]) {
    const t = popnixTime(p?.t);
    const level = num(p?.wl);
    if (t && level !== undefined) out.push({ t: new Date(t).getTime(), level });
  }
  return out;
}
