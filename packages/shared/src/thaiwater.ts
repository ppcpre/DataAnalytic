/**
 * Adapter สำหรับ API สาธารณะของคลังข้อมูลน้ำแห่งชาติ (ThaiWater, สสน.)
 *
 * อ่านค่าแบบยืดหยุ่น (ลองหลาย path) และข้ามเรคคอร์ดที่ไม่มีพิกัดหรืออยู่นอกพื้นที่ให้บริการ
 * ใช้ร่วมกันระหว่าง API และหน้าเว็บ (หน้าเว็บดึง ThaiWater ตรงเมื่อ API ถูกจำกัดความถี่)
 */
import {
  isServiceProvince,
  rainStatus,
  waterLevelStatus,
  type Floodgate,
  type Location,
  type RainStation,
  type WaterLevelStation,
} from './index.js';

type Rec = Record<string, unknown>;

function get(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Rec)[key];
  }
  return cur;
}

function first(obj: unknown, paths: string[]): unknown {
  for (const p of paths) {
    const v = get(obj, p);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

/** ข้อความอาจเป็น string หรือ { th, en } */
function text(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim() || undefined;
  if (v && typeof v === 'object') {
    const r = v as Rec;
    return text(r.th) ?? text(r.en);
  }
  return undefined;
}

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function isoTime(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  // ThaiWater มักส่งเวลาแบบ "YYYY-MM-DD HH:mm" ตามเวลาประเทศไทย
  const m = v.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?$/);
  const d = m ? new Date(`${m[1]}T${m[2]}${m[3] ?? ':00'}+07:00`) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** หา array ของเรคคอร์ดจาก response ที่อาจห่อหลายชั้น */
export function extractRecords(body: unknown, preferredPaths: string[]): Rec[] {
  for (const p of preferredPaths) {
    const v = get(body, p);
    if (Array.isArray(v)) return v as Rec[];
  }
  // fallback: array แรกที่พบใน body.data (ลึกไม่เกิน 3 ชั้น)
  const queue: Array<[unknown, number]> = [[get(body, 'data') ?? body, 0]];
  while (queue.length) {
    const [node, depth] = queue.shift()!;
    if (Array.isArray(node)) return node as Rec[];
    if (node && typeof node === 'object' && depth < 3) {
      for (const child of Object.values(node as Rec)) queue.push([child, depth + 1]);
    }
  }
  return [];
}

function location(r: Rec, stationKey: string, anyArea = false): Location | null {
  const lat = num(first(r, [`${stationKey}.tele_station_lat`, `${stationKey}.lat`, `${stationKey}.latitude`, 'lat']));
  const lng = num(first(r, [`${stationKey}.tele_station_long`, `${stationKey}.long`, `${stationKey}.lng`, `${stationKey}.longitude`, 'long', 'lng']));
  const province = String(first(r, ['geocode.province_code', `${stationKey}.province_code`, 'province_code']) ?? '');
  if (lat === null || lng === null) return null;
  if (!anyArea && !isServiceProvince(province)) return null;
  return {
    lat,
    lng,
    province,
    provinceName: text(first(r, ['geocode.province_name', `${stationKey}.province_name`, 'province_name'])),
    district: text(first(r, ['geocode.amphoe_name', `${stationKey}.amphoe_name`, 'amphoe_name'])),
  };
}

function agency(r: Rec): string {
  return (
    text(first(r, ['agency.agency_shortname', 'agency.agency_name', 'station.agency_name', 'agency_name'])) ??
    'ไม่ระบุหน่วยงาน'
  );
}

function stationName(r: Rec, stationKey: string): string {
  return (
    text(first(r, [`${stationKey}.tele_station_name`, `${stationKey}.station_name`, `${stationKey}.name`, 'station_name'])) ??
    'ไม่ทราบชื่อสถานี'
  );
}

function parseWaterLevelRecords(body: unknown, anyArea: boolean): WaterLevelStation[] {
  const out: WaterLevelStation[] = [];
  for (const r of extractRecords(body, ['waterlevel_data.data', 'data.waterlevel_data.data', 'data'])) {
    const loc = location(r, 'station', anyArea);
    const observedAt = isoTime(first(r, ['waterlevel_datetime', 'datetime']));
    if (!loc || !observedAt) continue;
    const levelMsl = num(first(r, ['waterlevel_msl', 'value']));
    const bankMsl = num(first(r, ['station.min_bank', 'station.left_bank', 'min_bank']));
    const groundMsl = num(first(r, ['station.ground_level', 'ground_level']));
    let percent = num(first(r, ['storage_percent', 'percent']));
    if (percent === null && levelMsl !== null && bankMsl) percent = (levelMsl / bankMsl) * 100;
    const code = text(first(r, ['station.tele_station_oldcode', 'station.station_oldcode', 'station.code']));
    out.push({
      id: `tw-wl-${String(first(r, ['station.id', 'id']) ?? `${loc.lat},${loc.lng}`)}`,
      name: stationName(r, 'station'),
      code,
      location: loc,
      observedAt,
      levelMsl,
      bankMsl,
      groundMsl,
      percent: percent === null ? null : Math.round(percent * 10) / 10,
      status: waterLevelStatus(percent),
      agency: agency(r),
    });
  }
  return out;
}

/** สถานีวัดระดับน้ำในพื้นที่ให้บริการ (กทม. และปริมณฑล) */
export function parseWaterLevel(body: unknown): WaterLevelStation[] {
  return parseWaterLevelRecords(body, false);
}

/** normalise รหัสสถานี เช่น "C.29A", "c29a" → "C29A" */
function normCode(code: string): string {
  return code.replace(/[^0-9a-z]/gi, '').toUpperCase();
}

/**
 * สถานีสำคัญทางต้นน้ำ (อยู่นอกพื้นที่ให้บริการได้) ตามรหัสที่กำหนด
 * เรียงตามลำดับรหัสใน codes (ปกติเรียงจากต้นน้ำลงมาท้ายน้ำ)
 */
export function parseKeyStations(body: unknown, codes: string[]): WaterLevelStation[] {
  const order = codes.map(normCode);
  return parseWaterLevelRecords(body, true)
    .filter((s) => s.code && order.includes(normCode(s.code)))
    .sort((a, b) => order.indexOf(normCode(a.code!)) - order.indexOf(normCode(b.code!)));
}

export function parseRain(body: unknown): RainStation[] {
  const out: RainStation[] = [];
  for (const r of extractRecords(body, ['data', 'data.data'])) {
    const loc = location(r, 'station');
    const observedAt = isoTime(first(r, ['rainfall_datetime', 'rain_datetime', 'datetime']));
    const rain24h = num(first(r, ['rain_24h', 'rainfall24h', 'value']));
    if (!loc || !observedAt || rain24h === null) continue;
    out.push({
      id: `tw-rain-${String(first(r, ['station.id', 'id']) ?? `${loc.lat},${loc.lng}`)}`,
      name: stationName(r, 'station'),
      location: loc,
      observedAt,
      rain24h,
      status: rainStatus(rain24h),
      agency: agency(r),
    });
  }
  return out;
}

export function parseFloodgates(body: unknown): Floodgate[] {
  const out: Floodgate[] = [];
  for (const r of extractRecords(body, ['data', 'data.data'])) {
    const key = get(r, 'floodgate') ? 'floodgate' : 'station';
    const loc = location(r, key);
    if (!loc) continue;
    out.push({
      id: `tw-fg-${String(first(r, [`${key}.id`, 'id']) ?? `${loc.lat},${loc.lng}`)}`,
      name: text(first(r, [`${key}.floodgate_name`, `${key}.tele_station_name`, `${key}.name`])) ?? 'ประตูระบายน้ำ',
      location: loc,
      observedAt: isoTime(first(r, ['floodgate_datetime', 'datetime'])),
      upstreamMsl: num(first(r, ['floodgate_value_upper', 'upstream_msl', 'upper'])),
      downstreamMsl: num(first(r, ['floodgate_value_lower', 'downstream_msl', 'lower'])),
      agency: agency(r),
    });
  }
  return out;
}
