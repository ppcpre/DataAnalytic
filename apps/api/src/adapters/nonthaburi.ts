/**
 * จุดเฝ้าระวังน้ำท่วมของเทศบาลนครนนทบุรี (http://182.52.224.70/?page=cctv)
 * ต้นทางมี API รายชื่อสถานี พร้อมพิกัด ระดับน้ำ และภาพกล้องของแต่ละจุด
 * แอปปักหมุดจุดที่มีกล้อง และเซนเซอร์น้ำท่วมถนน (จุด C) ที่มีค่าวัดล่าสุด ภาพกล้องต้องผ่าน /api/nont/image เพราะต้นทางเป็น http
 * (browser ไม่แสดงภาพ http ในหน้า https)
 *
 * เซิร์ฟเวอร์มีแต่ IP — Cloudflare Workers ใช้ fetch() กับ IP ไม่ได้ (error 1003) จึงดึงผ่าน TCP socket (raw-http.ts)
 * ถ้าดึงไม่ได้ แอปใช้รายชื่อจุดใน data/nonthaburi.ts
 */
import type { Camera, CameraReading } from '@flood-watch/shared';

type Rec = Record<string, unknown>;

export const NONT_HOST = '182.52.224.70';
/** เว็บของเทศบาล (ลิงก์ "เปิดดูในเว็บต้นทาง") */
export const NONT_BASE = `http://${NONT_HOST}`;
/** หน้ารวมภาพกล้องทุกจุด (หน้ารายละเอียดสถานีของต้นทางเปิดแล้วว่างในหลายเครื่อง) */
export const NONT_CCTV_PAGE = `${NONT_BASE}/?page=cctv`;
export const NONT_STATIONS_PATH = '/json.php?app=station';
export const NONT_OWNER = 'เทศบาลนครนนทบุรี';
/** ค่าวัดที่เก่ากว่านี้ไม่แสดง (หลายจุดหยุดส่งข้อมูลไปนานแล้ว แต่ภาพกล้องยังใช้ได้) */
const MAX_READING_AGE_MS = 12 * 3600_000;

/** ชื่อกล้องตามรูปแบบของต้นทาง เช่น "A1-คลองท่าทราย Cam1" — ใช้ตรวจค่าที่ส่งมาที่ /api/nont/image */
export const NONT_CAMERA_NAME = /^[A-Z]\d{1,2}-[^/\\?#&%<>"]{1,80}$/u;

export function nontImagePath(cameraName: string): string {
  return `/MilestoneImageService/ImageService.svc/ImageService/GetImage?width=800&height=450&cameraname=${encodeURIComponent(cameraName)}`;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** "2026-09-28 14:30" (เวลาไทย) → ISO */
function thaiTime(s: string | undefined): string | undefined {
  const m = s && /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/.exec(s);
  if (!m) return undefined;
  const d = new Date(`${m[1]}T${m[2]}:00+07:00`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** "…&cameraname=A1-คลองท่าทราย Cam1" → "A1-คลองท่าทราย Cam1" */
function cameraName(url: unknown): string | undefined {
  const s = str(url);
  const i = s?.indexOf('cameraname=') ?? -1;
  if (!s || i < 0) return undefined;
  let name = s.slice(i + 'cameraname='.length).split('&')[0];
  try {
    name = decodeURIComponent(name);
  } catch {
    /* ต้นทางส่งชื่อแบบไม่เข้ารหัสมา ใช้ตามเดิม */
  }
  name = name.trim();
  return NONT_CAMERA_NAME.test(name) ? name : undefined;
}

function reading(label: string, v: unknown, unit: string, key = 'now', historyId?: string): CameraReading | undefined {
  const r = v as Rec | null;
  if (!r || r.enable !== true) return undefined;
  const value = r.value as Rec | null;
  const now = num(value?.[key]);
  if (now === undefined) return undefined;
  return { label, value: now, unit, warning: num(value?.warning), danger: num(value?.danger), ...(historyId ? { historyId } : {}) };
}

/** รหัสชุดข้อมูลย้อนหลังของค่าวัด เช่น nont-STN2:down */
export const nontHistoryId = (stationId: string, side: 'up' | 'down') => `nont-${stationId}:${side}`;

export function parseNonthaburiStations(body: unknown, now = Date.now()): Camera[] {
  const list = (body as Rec | null)?.station;
  if (!Array.isArray(list)) return [];
  const out: Camera[] = [];
  for (const s of list as Rec[]) {
    const id = str(s.id);
    const code = str(s.code);
    const name = str(s.name);
    const loc = s.location as Rec | null;
    const lat = num(loc?.lat);
    const lng = num(loc?.lng);
    const cams = Array.isArray(s.cctv) ? (s.cctv as unknown[]).map(cameraName).filter((x): x is string => !!x) : [];
    if (!id || !name || lat === undefined || lng === undefined) continue;
    if (lat < 13.5 || lat > 14.2 || lng < 100.2 || lng > 100.8) continue;

    const observedAt = thaiTime(str(s.date));
    const recent = observedAt && now - new Date(observedAt).getTime() <= MAX_READING_AGE_MS;
    const data = (s.data ?? {}) as Rec;

    if (!cams.length) {
      // จุด C: เซนเซอร์วัดน้ำท่วมบนถนน (ไม่มีกล้อง) — ปักหมุดเฉพาะเมื่อมีค่าวัดล่าสุด
      const depth = recent && code?.startsWith('C') ? reading('ความลึกน้ำบนถนน', data.wl_up, 'ม.', 'now', nontHistoryId(id, 'up')) : undefined;
      if (!depth) continue;
      out.push({
        id: `nont-${id}`,
        name: name.replace(/\s+/g, ' '),
        road: `เซนเซอร์น้ำท่วมถนน · จุด ${code}`,
        location: { lat, lng, province: '12', provinceName: 'นนทบุรี' },
        owner: NONT_OWNER,
        url: `${NONT_BASE}/`,
        kind: 'water',
        readings: [depth],
        observedAt,
      });
      continue;
    }
    const readings = recent
      ? [
          reading('ระดับน้ำด้านเหนือประตู', data.wl_up, 'ม.', 'now', nontHistoryId(id, 'up')),
          reading('ระดับน้ำด้านท้ายประตู', data.wl_down, 'ม.', 'now', nontHistoryId(id, 'down')),
          reading('ฝนสะสมวันนี้', data.rf, 'มม.', 'day'),
        ].filter((x): x is CameraReading => !!x)
      : [];

    out.push({
      id: `nont-${id}`,
      name: name.replace(/\s+/g, ' '),
      road: `จุด ${code ?? id}${cams.length > 1 ? ` · กล้อง ${cams.length} ตัว (แสดงตัวแรก)` : ''}`,
      location: { lat, lng, province: '12', provinceName: 'นนทบุรี' },
      owner: NONT_OWNER,
      url: NONT_CCTV_PAGE,
      imageUrl: `/api/nont/image?cam=${encodeURIComponent(cams[0])}`,
      imageCredit: NONT_OWNER,
      kind: 'water',
      ...(readings.length ? { readings, observedAt } : {}),
    });
  }
  return out;
}
