import {
  parseKeyStations,
  parseRain,
  parseWaterLevel,
  type ApiResponse,
  type HistoryPoint,
  type RainStation,
  type WaterLevelStation,
} from '@flood-watch/shared';

/**
 * ดึงข้อมูลจาก ThaiWater ตรงจากเครื่องผู้ใช้ — ใช้เมื่อ API ของเราดึงไม่ได้
 * (ThaiWater จำกัดความถี่ตาม IP และ IP ของ Cloudflare ใช้ร่วมกับเว็บอื่นจำนวนมาก จึงมักได้ HTTP 429)
 * ThaiWater อนุญาต CORS ให้โดเมนของแอป
 */
const BASE = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public';
/** ตรงกับค่าเริ่มต้นของ KEY_STATION_CODES ฝั่ง API */
const KEY_STATION_CODES = ['C.2', 'C.13', 'C.7A', 'C.35'];
/** ตรงกับ MAX_READING_AGE_HOURS ฝั่ง API */
const MAX_READING_AGE_HOURS = 12;

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`ThaiWater ตอบกลับ HTTP ${res.status}`);
  return res.json();
}

const fresh = <T extends { observedAt: string }>(list: T[]): T[] => {
  const cutoff = Date.now() - MAX_READING_AGE_HOURS * 3600_000;
  return list.filter((x) => new Date(x.observedAt).getTime() >= cutoff);
};

const wrap = <T>(data: T[]): ApiResponse<T> => ({
  data,
  source: 'คลังข้อมูลน้ำแห่งชาติ (ThaiWater) · ดึงตรงจากเครื่องนี้',
  fetchedAt: new Date().toISOString(),
  sample: false,
  stale: false,
});

/** สร้างชุดดึงข้อมูลสำหรับการโหลดหนึ่งรอบ (ระดับน้ำกับสถานีต้นน้ำใช้ไฟล์เดียวกัน ดึงครั้งเดียว) */
export function directThaiWater() {
  let waterRaw: Promise<unknown> | null = null;
  const water = () => (waterRaw ??= getJson(`${BASE}/waterlevel_load`));
  return {
    waterLevel: async (): Promise<ApiResponse<WaterLevelStation>> => wrap(fresh(parseWaterLevel(await water()))),
    keyStations: async (): Promise<ApiResponse<WaterLevelStation>> =>
      wrap(fresh(parseKeyStations(await water(), KEY_STATION_CODES))),
    rain: async (): Promise<ApiResponse<RainStation>> => wrap(fresh(parseRain(await getJson(`${BASE}/rain_24h`)))),
  };
}

/** เวลาไทยของ ThaiWater ("2026-09-28 14:00") → ISO */
const thaiTimeToIso = (s: string) => new Date(`${s.replace(' ', 'T')}:00+07:00`).toISOString();
/** วันที่ตามเวลาไทย (YYYY-MM-DD) */
const thaiDate = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 10);

/**
 * ระดับน้ำย้อนหลังของสถานีจาก ThaiWater (ค่าทุก ~10 นาที) — ใช้เมื่อ API ของเรายังเก็บประวัติไม่พอ
 * ร้อยละเทียบตลิ่ง = (ระดับน้ำ - ท้องน้ำ) / (ตลิ่ง - ท้องน้ำ) ตามวิธีของ ThaiWater
 */
export async function thaiWaterHistory(stationId: string, hours: number): Promise<HistoryPoint[]> {
  const n = /^tw-wl-(\d+)$/.exec(stationId)?.[1];
  if (!n) return [];
  const now = Date.now();
  const params = new URLSearchParams({
    station_type: 'tele_waterlevel',
    station_id: n,
    start_date: thaiDate(now - hours * 3600_000),
    end_date: thaiDate(now),
  });
  const body = (await getJson(`${BASE}/waterlevel_graph?${params}`)) as {
    data?: { graph_data?: { datetime: string; value: number | null }[]; min_bank?: number | null; ground_level?: number | null };
  };
  const d = body.data;
  const bank = d?.min_bank ?? null;
  const ground = d?.ground_level ?? null;
  const cutoff = now - hours * 3600_000;
  const out: HistoryPoint[] = [];
  for (const g of d?.graph_data ?? []) {
    if (g.value === null || typeof g.value !== 'number') continue;
    const t = thaiTimeToIso(g.datetime);
    if (new Date(t).getTime() < cutoff) continue;
    let percent: number | null = null;
    if (bank !== null && ground !== null && bank > ground) percent = ((g.value - ground) / (bank - ground)) * 100;
    else if (bank) percent = (g.value / bank) * 100;
    out.push({ t, levelMsl: g.value, percent: percent === null ? null : Math.round(percent * 10) / 10 });
  }
  return out;
}
