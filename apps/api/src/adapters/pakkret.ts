/**
 * เซนเซอร์ระดับน้ำท่าน้ำปากเกร็ด (https://www.pakkretconnect.com/liffwater/eon)
 * หน้าเว็บฝังรายการเซนเซอร์ไว้ในตัวแปร sensorData และมีภาพกล้องล่าสุดที่เปิดผ่าน https ได้
 */
import type { Camera, CameraReading } from '@flood-watch/shared';

type Rec = Record<string, unknown>;

export const PAKKRET_EON_URL = 'https://www.pakkretconnect.com/liffwater/eon';
const ORIGIN = 'https://www.pakkretconnect.com';
const OWNER = 'เทศบาลนครปากเกร็ด';

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const decodeEntities = (s: string) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&');

/** "2026-09-28 14:45:05.000" (เวลาไทย) → ISO */
function thaiTime(s: string | undefined): string | undefined {
  const m = s && /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/.exec(s);
  if (!m) return undefined;
  const d = new Date(`${m[1]}T${m[2]}+07:00`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** ภาพกล้องล่าสุดในหน้า เช่น ../snapshots/192.168.21.66/192.168.21.66.jpg?T=… → URL เต็มแบบ https */
function snapshotUrl(html: string): string | undefined {
  const m = /<img[^>]+src="([^"]*snapshots\/[^"?]+\.jpe?g)[^"]*"[^>]*snapshot-image/i.exec(html);
  if (!m) return undefined;
  const path = m[1].replace(/^(\.\.\/)+/, '/').replace(/^(?!\/)/, '/');
  return /^\/snapshots\/[\w./-]+$/.test(path) ? `${ORIGIN}${path}` : undefined;
}

/** ระดับน้ำสูงสุดในอดีตที่หน้าเว็บวาดไว้บนภาพ เช่น "ระดับน้ำสูงสุดปี 54" + "3.38 เมตร" */
function historicMarks(html: string): string[] {
  const m = /thresholds='([^']+)'/.exec(html);
  if (!m) return [];
  try {
    const t = JSON.parse(decodeEntities(m[1])) as Rec;
    const texts = (Array.isArray(t.redText) ? t.redText : []).map((x) => str((x as Rec).text)).filter(Boolean) as string[];
    const out: string[] = [];
    for (let i = 0; i + 1 < texts.length; i += 2) {
      const year = /ปี\s*(\d{2,4})/.exec(texts[i])?.[1];
      const level = /([\d.]+)\s*เมตร/.exec(texts[i + 1])?.[1];
      if (year && level) out.push(`สูงสุดปี ${year}: ${level} ม.`);
    }
    return out;
  } catch {
    return [];
  }
}

export function parsePakkretEon(html: string): Camera[] {
  const m = /const\s+sensorData\s*=\s*(\[[\s\S]*?\]);/.exec(html);
  if (!m) return [];
  let list: Rec[];
  try {
    list = JSON.parse(m[1]) as Rec[];
  } catch {
    return [];
  }
  const image = snapshotUrl(html);
  const marks = historicMarks(html);
  const out: Camera[] = [];
  for (const s of list) {
    const id = str(s.sensor_id);
    const lat = Number(s.latitude);
    const lng = Number(s.longitude);
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const level = Number(s.water_level);
    const readings: CameraReading[] = Number.isFinite(level) ? [{ label: 'ระดับน้ำ', value: level, unit: 'ม.' }] : [];
    const status = str(s.status_label);
    out.push({
      id: `pakkret-eon-${id}`,
      name: 'ท่าน้ำปากเกร็ด (เซนเซอร์ระดับน้ำ)',
      road: ['แม่น้ำเจ้าพระยา', status && `สถานะ: ${status}`, ...marks].filter(Boolean).join(' · '),
      location: { lat, lng, province: '12', provinceName: 'นนทบุรี' },
      owner: OWNER,
      url: PAKKRET_EON_URL,
      ...(image && out.length === 0 ? { imageUrl: image, imageCredit: 'Pak Kret Connect' } : {}),
      embedUrl: PAKKRET_EON_URL,
      kind: 'water',
      ...(readings.length ? { readings, observedAt: thaiTime(str(s.log_datetime)) } : {}),
    });
  }
  return out;
}
