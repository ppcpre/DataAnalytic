import { escapeHtml, formatAgo, formatTime } from './format';

/**
 * ภาพเรดาร์ฝนที่ครอบคลุม กทม. และปริมณฑล จากคลังข้อมูลน้ำแห่งชาติ (ThaiWater)
 * ดึงรายการตรงจากเครื่องผู้ใช้ (ThaiWater อนุญาต CORS ให้โดเมนของแอป และจำกัดความถี่ IP ของ Cloudflare)
 */
const TW = 'https://api-v3.thaiwater.net/api/v1/thaiwater30';
const LIST_URL = `${TW}/analyst/radar_img`;
const imageUrl = (mediaPath: string) => `${TW}/shared/image?image=${encodeURIComponent(mediaPath)}`;

/** เรดาร์ที่ครอบคลุมพื้นที่ให้บริการ เรียงตามความสำคัญ */
const WANTED = ['nkm', 'njk', 'svp120'];
/** ภาพเก่ากว่านี้ถือว่าเรดาร์ไม่ได้ส่งภาพใหม่ */
const MAX_AGE_MS = 6 * 3600_000;

export interface RadarImage {
  type: string;
  name: string;
  agency: string;
  takenAt: string;
  url: string;
  thumbUrl: string;
}

type Rec = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** "2026-10-01 11:25" + เขตเวลาของต้นทาง (UTC หรือ TST = เวลาไทย) → ISO */
function toIso(s: string | undefined, tz: string | undefined): string | undefined {
  const m = s && /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/.exec(s);
  if (!m) return undefined;
  const d = new Date(`${m[1]}T${m[2]}:00${tz === 'UTC' ? 'Z' : '+07:00'}`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function parseRadar(body: unknown): RadarImage[] {
  const rows = (body as Rec | null)?.data;
  if (!Array.isArray(rows)) return [];
  const out: RadarImage[] = [];
  for (const type of WANTED) {
    const r = (rows as Rec[]).find((x) => x.radar_type === type);
    const media = str(r?.media_path);
    const takenAt = toIso(str(r?.media_datetime), str(r?.timezone));
    if (!r || !media || !takenAt || /error/i.test(str(r.filename) ?? '')) continue;
    out.push({
      type,
      name: str(r.radar_name) ?? type,
      agency: r.agency === 'bma' ? 'กรุงเทพมหานคร' : r.agency === 'tmd' ? 'กรมอุตุนิยมวิทยา' : String(r.agency ?? ''),
      takenAt,
      url: imageUrl(media),
      thumbUrl: imageUrl(str(r.media_path_thumb) ?? media),
    });
  }
  return out;
}

export async function loadRadar(): Promise<RadarImage[]> {
  const res = await fetch(LIST_URL, { credentials: 'omit' });
  if (!res.ok) throw new Error(`ThaiWater ตอบกลับ HTTP ${res.status}`);
  return parseRadar(await res.json());
}

export function radarHtml(list: RadarImage[], now = Date.now()): string {
  if (!list.length) return '';
  return `
    <h2 class="col-title">ภาพเรดาร์ฝน · แตะเพื่อดูภาพเต็ม</h2>
    <div class="radar-grid">
      ${list
        .map((r) => {
          const old = now - new Date(r.takenAt).getTime() > MAX_AGE_MS;
          return `
        <a class="radar-card" href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer">
          <img src="${escapeHtml(r.thumbUrl)}" alt="${escapeHtml(r.name)}" loading="lazy" referrerpolicy="no-referrer" />
          <span class="radar-name">${escapeHtml(r.name)}</span>
          <span class="radar-time${old ? ' is-old' : ''}">${escapeHtml(r.agency)} · ${escapeHtml(formatAgo(r.takenAt, now) || formatTime(r.takenAt))}${old ? ' (ไม่มีภาพใหม่)' : ''}</span>
        </a>`;
        })
        .join('')}
    </div>
    <span class="btn-caption">ภาพ: คลังข้อมูลน้ำแห่งชาติ (ThaiWater) · สีเขียว-เหลือง-แดง = ฝนเบา-หนัก</span>`;
}
