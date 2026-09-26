export type DataMode = 'live' | 'sample';

export interface Config {
  port: number;
  dataMode: DataMode;
  /** อายุ cache ของข้อมูลจากต้นทาง (มิลลิวินาที) */
  cacheTtlMs: number;
  /** ระยะเวลาสูงสุดที่ยอมส่งข้อมูลเก่าเมื่อดึงข้อมูลใหม่ไม่สำเร็จ */
  staleMaxMs: number;
  /** origin ของหน้าเว็บที่อนุญาตให้เรียก API (คั่นด้วย ,) หรือ * */
  corsOrigin: string;
  thaiwater: {
    waterLevelUrl: string;
    rainUrl: string;
    /** ยังไม่พบ endpoint สาธารณะของสถานะประตูระบายน้ำ — เว้นว่างได้ */
    floodgateUrl: string;
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const base = env.THAIWATER_BASE_URL ?? 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public';
  return {
    port: Number(env.PORT ?? 8787),
    dataMode: env.DATA_MODE === 'sample' ? 'sample' : 'live',
    cacheTtlMs: Number(env.CACHE_TTL_SECONDS ?? 300) * 1000,
    staleMaxMs: Number(env.STALE_MAX_SECONDS ?? 6 * 3600) * 1000,
    corsOrigin: env.CORS_ORIGIN ?? '*',
    thaiwater: {
      waterLevelUrl: env.THAIWATER_WATERLEVEL_URL ?? `${base}/waterlevel_load`,
      rainUrl: env.THAIWATER_RAIN_URL ?? `${base}/rain_24h`,
      floodgateUrl: env.THAIWATER_FLOODGATE_URL ?? '',
    },
  };
}
