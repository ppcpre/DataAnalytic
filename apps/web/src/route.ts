/**
 * หาสิ่งที่อยู่ตามแนวเส้นทาง (เช็กเส้นทาง): ระยะจากจุดถึงเส้นทาง และตำแหน่งตามเส้นทาง (กม. จากต้นทาง)
 * ใช้การฉายพิกัดแบบระนาบเฉพาะที่ ซึ่งแม่นพอสำหรับระยะไม่กี่ร้อยกิโลเมตร
 */
export type LatLng = { lat: number; lng: number };
export type RouteCoords = Array<[number, number]>;

export interface RouteHit<T> {
  item: T;
  /** ระยะห่างจากเส้นทาง (กม.) */
  distKm: number;
  /** อยู่ที่ระยะเท่าไรจากต้นทางตามเส้นทาง (กม.) */
  alongKm: number;
}

const KM_PER_DEG_LAT = 110.574;

function projector(coords: RouteCoords) {
  const lat0 = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180);
  return (lat: number, lng: number): [number, number] => [lng * kx, lat * KM_PER_DEG_LAT];
}

/** เตรียมเส้นทางครั้งเดียว แล้ววัดหลายจุด */
export function routeMeasurer(coords: RouteCoords) {
  if (coords.length < 2) throw new Error('เส้นทางต้องมีอย่างน้อย 2 จุด');
  const proj = projector(coords);
  const pts = coords.map(([la, ln]) => proj(la, ln));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const lats = coords.map((c) => c[0]);
  const lngs = coords.map((c) => c[1]);
  const box = { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLng: Math.min(...lngs), maxLng: Math.max(...lngs) };
  return {
    lengthKm: cum[cum.length - 1],
    /** ตัดจุดที่อยู่นอกกรอบเส้นทาง + ระยะ ก่อนคำนวณละเอียด */
    nearBox(p: LatLng, km: number): boolean {
      const dLat = km / KM_PER_DEG_LAT;
      const dLng = km / (111.32 * Math.cos((p.lat * Math.PI) / 180));
      return p.lat >= box.minLat - dLat && p.lat <= box.maxLat + dLat && p.lng >= box.minLng - dLng && p.lng <= box.maxLng + dLng;
    },
    measure(p: LatLng): { distKm: number; alongKm: number } {
      const [x, y] = proj(p.lat, p.lng);
      let best = Infinity;
      let along = 0;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1];
        const dx = pts[i][0] - ax;
        const dy = pts[i][1] - ay;
        const len2 = dx * dx + dy * dy;
        const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
        const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
        if (d < best) {
          best = d;
          along = cum[i - 1] + t * Math.sqrt(len2);
        }
      }
      return { distKm: best, alongKm: along };
    },
  };
}

/** รายการที่อยู่ห่างเส้นทางไม่เกิน bufferKm เรียงจากต้นทางไปปลายทาง */
export function alongRoute<T extends { location: LatLng }>(items: T[], coords: RouteCoords, bufferKm: number): RouteHit<T>[] {
  const m = routeMeasurer(coords);
  const out: RouteHit<T>[] = [];
  for (const item of items) {
    if (!m.nearBox(item.location, bufferKm)) continue;
    const r = m.measure(item.location);
    if (r.distKm <= bufferKm) out.push({ item, ...r });
  }
  return out.sort((a, b) => a.alongKm - b.alongKm);
}
