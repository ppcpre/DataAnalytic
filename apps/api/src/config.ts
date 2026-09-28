export type DataMode = 'live' | 'sample';

export interface Config {
  port: number;
  dataMode: DataMode;
  /** อายุ cache ของข้อมูลจากต้นทาง (มิลลิวินาที) */
  cacheTtlMs: number;
  /** ระยะเวลาสูงสุดที่ยอมส่งข้อมูลเก่าเมื่อดึงข้อมูลใหม่ไม่สำเร็จ */
  staleMaxMs: number;
  /** ไม่แสดงค่าวัดที่เก่ากว่านี้ (ชั่วโมง) — สถานีที่ส่งข้อมูลไม่ต่อเนื่องจะไม่ถูกแสดงเป็นสถานะปัจจุบัน */
  maxReadingAgeHours: number;
  /** origin ของหน้าเว็บที่อนุญาตให้เรียก API (คั่นด้วย ,) หรือ * */
  corsOrigin: string;
  thaiwater: {
    waterLevelUrl: string;
    rainUrl: string;
    /** ยังไม่พบ endpoint สาธารณะของสถานะประตูระบายน้ำ — เว้นว่างได้ */
    floodgateUrl: string;
    /** รหัสสถานีต้นน้ำสำคัญที่จะแสดงเพิ่ม (เรียงจากต้นน้ำลงมา) */
    keyStationCodes: string[];
  };
  geocode: {
    /** endpoint ค้นหาสถานที่แบบ Photon — ว่าง = ปิดการค้นหาสถานที่ */
    url: string;
    /** กรอบพื้นที่ค้นหา: กรุงเทพฯ และปริมณฑล */
    bbox: { minLat: number; minLng: number; maxLat: number; maxLng: number };
    cacheTtlMs: number;
  };
  cameras: {
    /** รายชื่อกล้องพร้อมพิกัดแบบ Longdo Traffic (camera.json) — ว่าง = ใช้เฉพาะรายการใน data/cameras.ts */
    listUrl: string;
    cacheTtlMs: number;
  };
  floodhub: {
    /** API key ของ Google Flood Forecasting API — ว่าง = ปิดชั้นข้อมูลนี้ */
    apiKey: string;
    baseUrl: string;
    regionCode: string;
    /** กรอบพื้นที่ที่แสดง: minLat,minLng,maxLat,maxLng */
    bbox: { minLat: number; minLng: number; maxLat: number; maxLng: number };
  };
}

function parseBBox(v: string) {
  const [minLat, minLng, maxLat, maxLng] = v.split(',').map(Number);
  return { minLat, minLng, maxLat, maxLng };
}

export type Env = Record<string, string | undefined>;

export function loadConfig(env: Env = process.env): Config {
  const base = env.THAIWATER_BASE_URL ?? 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public';
  return {
    port: Number(env.PORT ?? 8787),
    dataMode: env.DATA_MODE === 'sample' ? 'sample' : 'live',
    cacheTtlMs: Number(env.CACHE_TTL_SECONDS ?? 300) * 1000,
    staleMaxMs: Number(env.STALE_MAX_SECONDS ?? 6 * 3600) * 1000,
    corsOrigin: env.CORS_ORIGIN ?? '*',
    maxReadingAgeHours: Number(env.MAX_READING_AGE_HOURS ?? 12),
    thaiwater: {
      waterLevelUrl: env.THAIWATER_WATERLEVEL_URL ?? `${base}/waterlevel_load`,
      rainUrl: env.THAIWATER_RAIN_URL ?? `${base}/rain_24h`,
      floodgateUrl: env.THAIWATER_FLOODGATE_URL ?? '',
      // C.2 นครสวรรค์, C.13 ท้ายเขื่อนเจ้าพระยา (ชัยนาท), C.7A บ้านบางแก้ว (อ่างทอง), C.35 บ้านป้อม (อยุธยา)
      // (C.29A บางไทร ไม่มีในชุดข้อมูล waterlevel_load)
      keyStationCodes: (env.KEY_STATION_CODES ?? 'C.2,C.13,C.7A,C.35')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    },
    geocode: {
      url: env.GEOCODER_URL ?? 'https://photon.komoot.io/api/',
      bbox: parseBBox(env.GEOCODER_BBOX ?? '13.4,99.8,14.3,100.95'),
      cacheTtlMs: Number(env.GEOCODER_CACHE_SECONDS ?? 24 * 3600) * 1000,
    },
    cameras: {
      listUrl: env.CAMERA_LIST_URL ?? 'https://traffic.longdo.com/camera.json',
      cacheTtlMs: Number(env.CAMERA_CACHE_SECONDS ?? 3600) * 1000,
    },
    floodhub: {
      apiKey: env.GOOGLE_FLOOD_API_KEY ?? '',
      baseUrl: env.GOOGLE_FLOOD_API_BASE ?? 'https://floodforecasting.googleapis.com',
      regionCode: env.GOOGLE_FLOOD_REGION ?? 'TH',
      // ลุ่มเจ้าพระยาตอนล่าง: นครสวรรค์ลงมาถึงอ่าวไทย
      bbox: parseBBox(env.GOOGLE_FLOOD_BBOX ?? '13.3,99.7,15.9,101.2'),
    },
  };
}
