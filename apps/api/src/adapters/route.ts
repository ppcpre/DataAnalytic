/**
 * เส้นทางขับรถระหว่างสองจุด (สำหรับ "เช็กเส้นทาง") ด้วยบริการแบบ OSRM ที่ใช้ข้อมูล OpenStreetMap
 * ค่าเริ่มต้นใช้ router.project-osrm.org (บริการสาธิตของโครงการ OSRM ใช้ได้สำหรับปริมาณน้อย) — เปลี่ยนด้วย ROUTER_URL
 */
type Rec = Record<string, unknown>;

export interface RoutePoint {
  lat: number;
  lng: number;
}
export interface RouteResult {
  /** จุดตามแนวเส้นทาง [lat, lng] */
  coordinates: Array<[number, number]>;
  distanceKm: number;
  durationMin: number;
}

/** กรอบที่รับคำขอ: ภาคกลาง/ตะวันออก (ครอบคลุมจังหวัดที่แอปแสดงข้อมูล) */
const AREA = { minLat: 12.4, maxLat: 16.5, minLng: 99.0, maxLng: 102.5 };
/** ระยะทางตรงสูงสุดที่รับ (กม.) — กันคำขอเส้นทางข้ามภาค */
export const MAX_ROUTE_KM = 250;

/** "13.75,100.5" → จุด (ต้องอยู่ในกรอบพื้นที่) */
export function parsePoint(v: string | undefined): RoutePoint | undefined {
  const m = /^\s*(-?\d{1,2}(?:\.\d{1,7})?)\s*,\s*(-?\d{1,3}(?:\.\d{1,7})?)\s*$/.exec(v ?? '');
  if (!m) return undefined;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (lat < AREA.minLat || lat > AREA.maxLat || lng < AREA.minLng || lng > AREA.maxLng) return undefined;
  return { lat, lng };
}

/** ระยะทางตรง (กม.) */
export function straightKm(a: RoutePoint, b: RoutePoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** ปัดพิกัด (~10 ม.) ใช้เป็น cache key และส่งต่อให้บริการเส้นทาง */
export const roundPoint = (p: RoutePoint): RoutePoint => ({ lat: Math.round(p.lat * 1e4) / 1e4, lng: Math.round(p.lng * 1e4) / 1e4 });

export function osrmRouteUrl(base: string, from: RoutePoint, to: RoutePoint): string {
  const root = base.replace(/\/+$/, '');
  return `${root}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&alternatives=false&steps=false`;
}

export function parseOsrmRoute(body: unknown): RouteResult | undefined {
  const b = body as Rec | null;
  if (b?.code !== 'Ok' || !Array.isArray(b.routes) || !b.routes.length) return undefined;
  const r = b.routes[0] as Rec;
  const coords = ((r.geometry as Rec | null)?.coordinates ?? []) as unknown[];
  const out: Array<[number, number]> = [];
  for (const c of coords) {
    if (!Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') continue;
    out.push([Math.round(c[1] * 1e6) / 1e6, Math.round(c[0] * 1e6) / 1e6]);
  }
  const distance = typeof r.distance === 'number' ? r.distance : NaN;
  const duration = typeof r.duration === 'number' ? r.duration : NaN;
  if (out.length < 2 || !Number.isFinite(distance) || !Number.isFinite(duration)) return undefined;
  return { coordinates: out, distanceKm: Math.round(distance / 100) / 10, durationMin: Math.round(duration / 60) };
}
