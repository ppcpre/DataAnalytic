/**
 * ค้นหาสถานที่ด้วย Photon (https://photon.komoot.io) ซึ่งใช้ข้อมูล OpenStreetMap และใช้ได้ฟรี
 * จำกัดผลลัพธ์ในกรอบพื้นที่กรุงเทพฯ และปริมณฑล
 */
import type { Place } from '@flood-watch/shared';

type Rec = Record<string, unknown>;

export interface GeocodeBBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export function geocodeUrl(base: string, q: string, bbox: GeocodeBBox, limit = 8): string {
  const params = new URLSearchParams({
    q,
    limit: String(limit),
    bbox: [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat].join(','),
  });
  return `${base}?${params}`;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

export function parsePhoton(body: unknown): Place[] {
  const features = (body as Rec | null)?.features;
  if (!Array.isArray(features)) return [];
  const out: Place[] = [];
  const seen = new Set<string>();
  for (const f of features as Rec[]) {
    const coords = (f.geometry as Rec | undefined)?.coordinates;
    const p = (f.properties ?? {}) as Rec;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const [lng, lat] = coords.map(Number);
    const name = str(p.name) ?? str(p.street);
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const detail = [str(p.district), str(p.city) ?? str(p.county), str(p.state)]
      .filter((v, i, a) => v && a.indexOf(v) === i && v !== name)
      .join(', ');
    const key = `${name}|${detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `osm-${String(p.osm_type ?? '')}${String(p.osm_id ?? key)}`,
      name,
      detail,
      lat,
      lng,
      kind: str(p.osm_value) ?? str(p.type) ?? 'place',
    });
  }
  return out;
}
