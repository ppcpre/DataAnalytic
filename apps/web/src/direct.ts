import {
  parseKeyStations,
  parseRain,
  parseWaterLevel,
  type ApiResponse,
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
