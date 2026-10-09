/**
 * ระบบติดตามน้ำท่วมของเทศบาลนครรังสิต (https://cdp.rangsitcity.go.th/)
 * หน้าเว็บ (Next.js) ฝังข้อมูลไว้ใน self.__next_f.push(...) ของหน้าแรก:
 * - cameras: กล้อง CCTV จุดเฝ้าระวัง พร้อมระดับเตือนภัยที่ระบบประเมินจากภาพ (watch.level) — ภาพล่าสุดที่ /api/flood/snapshot/<id>
 *   (ต้นทางอัปเดตทุกไม่กี่วินาที)
 * - reports: จุดน้ำท่วมที่ประชาชนแจ้ง (เจ้าหน้าที่ตรวจก่อนเผยแพร่) พร้อมภาพ /api/flood/image/<code> และคลิป /api/flood/video/<code>
 */
import type { Camera, CameraAlert } from '@flood-watch/shared';

type Rec = Record<string, unknown>;

export const RANGSIT_BASE = 'https://cdp.rangsitcity.go.th';
export const RANGSIT_PAGE = `${RANGSIT_BASE}/`;
const OWNER = 'เทศบาลนครรังสิต';
/** รายงานจากประชาชนที่เก่ากว่านี้ไม่แสดง (ต้นทางยังเผยแพร่ไว้ แต่สถานการณ์อาจเปลี่ยนแล้ว) */
export const RANGSIT_REPORT_MAX_AGE_MS = 7 * 24 * 3600_000;

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
/** ค่าวันที่ของ React Server Components อาจขึ้นต้นด้วย "$D" */
const iso = (v: unknown) => {
  const s = str(v)?.replace(/^\$D/, '');
  const d = s ? new Date(s) : undefined;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : undefined;
};
const inArea = (lat: number, lng: number) => lat >= 13.7 && lat <= 14.3 && lng >= 100.3 && lng <= 101;

/** ระดับเตือนภัยของกล้อง (ชื่อตามเว็บต้นทาง) */
const CAMERA_LEVELS: Record<string, { level: CameraAlert['level']; label: string }> = {
  NORMAL: { level: 'normal', label: 'ปกติ' },
  MONITOR: { level: 'normal', label: 'ติดตามสถานการณ์' },
  WATCH: { level: 'watch', label: 'เฝ้าระวัง' },
  NEAR_CRITICAL: { level: 'watch', label: 'ใกล้วิกฤต' },
  CRITICAL: { level: 'critical', label: 'วิกฤต' },
};

/** ระดับน้ำที่ประชาชนแจ้ง */
const REPORT_LEVELS: Record<string, { level: CameraAlert['level']; label: string }> = {
  ANKLE: { level: 'normal', label: 'ระดับข้อเท้า' },
  KNEE: { level: 'watch', label: 'ระดับเข่า' },
  WAIST: { level: 'critical', label: 'ระดับเอว' },
  IMPASSABLE: { level: 'critical', label: 'รถเล็กผ่านไม่ได้' },
};

/** ข้อความของ self.__next_f.push([1,"…"]) ทุกก้อนต่อกัน */
export function nextFlightData(html: string): string {
  const out: string[] = [];
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    try {
      out.push(JSON.parse(m[1]) as string);
    } catch {
      /* ก้อนที่อ่านไม่ได้ข้ามไป */
    }
  }
  return out.join('');
}

/** อ่าน array JSON ที่ตามหลัง "key":[ ตัวแรกในข้อความ */
export function jsonArrayAfter(s: string, key: string): unknown[] | undefined {
  const at = s.indexOf(`"${key}":[`);
  if (at < 0) return undefined;
  const start = at + key.length + 3;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          const v = JSON.parse(s.slice(start, i + 1)) as unknown;
          return Array.isArray(v) ? v : undefined;
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

export function parseRangsit(html: string, now = Date.now()): Camera[] {
  const data = nextFlightData(html);
  const out: Camera[] = [];

  for (const c of (jsonArrayAfter(data, 'cameras') ?? []) as Rec[]) {
    const id = num(c?.id);
    const name = str(c?.name);
    const lat = num(c?.latitude);
    const lng = num(c?.longitude);
    if (id === undefined || !Number.isInteger(id) || !name || lat === undefined || lng === undefined || !inArea(lat, lng)) continue;
    const watch = (c.watch ?? null) as Rec | null;
    const lv = CAMERA_LEVELS[str(watch?.level) ?? ''];
    const note = str(watch?.cvReason) ?? str(watch?.note);
    const alert: CameraAlert | undefined = lv
      ? { ...lv, ...(note ? { note } : {}), ...(iso(watch?.updatedAt) ? { at: iso(watch?.updatedAt) } : {}) }
      : undefined;
    out.push({
      id: `rs-cam-${id}`,
      name,
      road: str(watch?.label) ?? 'กล้องจุดเฝ้าระวังน้ำท่วม',
      location: { lat, lng, province: '13', provinceName: 'ปทุมธานี' },
      owner: OWNER,
      url: RANGSIT_PAGE,
      imageUrl: `${RANGSIT_BASE}/api/flood/snapshot/${id}`,
      imageCredit: OWNER,
      kind: 'water',
      ...(alert ? { alert } : {}),
    });
  }

  for (const r of (jsonArrayAfter(data, 'reports') ?? []) as Rec[]) {
    const code = str(r?.code);
    const lat = num(r?.latitude);
    const lng = num(r?.longitude);
    const at = iso(r?.createdAt);
    const lv = REPORT_LEVELS[str(r?.waterLevel) ?? ''];
    if (!code || !/^[A-Z0-9]{6,16}$/.test(code) || lat === undefined || lng === undefined || !inArea(lat, lng) || !at || !lv) continue;
    if (now - new Date(at).getTime() > RANGSIT_REPORT_MAX_AGE_MS) continue;
    const note = str(r.description);
    out.push({
      id: `rs-rep-${code}`,
      name: str(r.locationName) ?? 'จุดน้ำท่วมที่ประชาชนแจ้ง',
      road: `ประชาชนแจ้งน้ำท่วม · ${lv.label}`,
      location: { lat, lng, province: '13', provinceName: 'ปทุมธานี' },
      owner: OWNER,
      url: RANGSIT_PAGE,
      imageUrl: `${RANGSIT_BASE}/api/flood/image/${code}`,
      ...(r.hasVideo === true ? { videoUrl: `${RANGSIT_BASE}/api/flood/video/${code}` } : {}),
      imageCredit: 'ประชาชนผู้แจ้ง (ตรวจสอบโดยเทศบาล)',
      imageTakenAt: at,
      kind: 'water',
      alert: { ...lv, ...(note ? { note } : {}), at, reported: true },
    });
  }
  return out;
}
