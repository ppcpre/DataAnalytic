import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import type { ApiResponse } from '@flood-watch/shared';
import { TtlCache } from './cache.js';
import type { Config } from './config.js';
import { fetchJson, postJson, UpstreamError } from './http.js';
import { parseFloodgates, parseKeyStations, parseRain, parseWaterLevel } from './adapters/thaiwater.js';
import { fetchFloodStatusPages, parseFloodStatuses } from './adapters/floodhub.js';
import {
  sampleFloodForecasts,
  sampleFloodgates,
  sampleKeyStations,
  sampleRain,
  sampleWaterLevel,
} from './adapters/sample.js';
import { CAMERA_LINKS, OFFICIAL_LINKS } from './links.js';

type GetJson = (url: string) => Promise<unknown>;
type PostJson = (url: string, body: unknown) => Promise<unknown>;

const THAIWATER = 'คลังข้อมูลน้ำแห่งชาติ (ThaiWater)';
const FLOODHUB = 'Google Flood Hub';

interface Dataset<T> {
  key: string;
  source: string;
  /** false = ยังไม่ได้ตั้งค่าแหล่งข้อมูล (ส่งรายการว่าง) */
  enabled: () => boolean;
  load: () => Promise<T[]>;
  sample: () => T[];
}

export function createApp(config: Config, getJson: GetJson = fetchJson, post: PostJson = postJson) {
  const cache = new TtlCache(config.cacheTtlMs, config.staleMaxMs);
  const app = new Hono();

  app.use(
    '/api/*',
    cors({ origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',').map((s) => s.trim()) }),
  );

  /** ข้อมูลระดับน้ำทั้งประเทศจาก ThaiWater ใช้ร่วมกันระหว่าง /water-level และ /key-stations */
  const waterLevelRaw = async () => {
    const url = config.thaiwater.waterLevelUrl;
    const r = await cache.get('thaiwater-waterlevel', () => getJson(url));
    // ถ้าได้ค่าเก่า ให้ถือว่าล้มเหลว เพื่อให้ปลายทางใช้ค่าเก่าของตัวเองและติดป้าย stale ถูกต้อง
    if (r.stale) throw new UpstreamError('ดึงข้อมูลใหม่จากต้นทางไม่สำเร็จ', url);
    return r.value;
  };

  function serve<T>(ds: Dataset<T>) {
    return async (c: Context) => {
      c.header('cache-control', 'public, max-age=60');
      const reply = (body: ApiResponse<T>) => c.json(body);
      if (config.dataMode === 'sample') {
        return reply({
          data: ds.sample(),
          source: 'ข้อมูลตัวอย่าง (ไม่ใช่ข้อมูลจริง)',
          fetchedAt: new Date().toISOString(),
          sample: true,
          stale: false,
        });
      }
      if (!ds.enabled()) {
        return reply({
          data: [],
          source: 'ยังไม่ได้ตั้งค่าแหล่งข้อมูล',
          fetchedAt: new Date().toISOString(),
          sample: false,
          stale: false,
        });
      }
      try {
        const result = await cache.get(ds.key, ds.load);
        return reply({
          data: result.value,
          source: ds.source,
          fetchedAt: result.fetchedAt.toISOString(),
          sample: false,
          stale: result.stale,
        });
      } catch (err) {
        const message = err instanceof UpstreamError ? err.message : 'เกิดข้อผิดพลาดในการดึงข้อมูล';
        console.error(`[${ds.key}]`, err);
        return c.json({ error: message }, 502);
      }
    };
  }

  app.get('/api/health', (c) =>
    c.json({
      ok: true,
      dataMode: config.dataMode,
      floodhub: config.dataMode === 'sample' || !!config.floodhub.apiKey,
      floodgates: config.dataMode === 'sample' || !!config.thaiwater.floodgateUrl,
    }),
  );

  app.get(
    '/api/water-level',
    serve({
      key: 'water-level',
      source: THAIWATER,
      enabled: () => !!config.thaiwater.waterLevelUrl,
      load: async () => parseWaterLevel(await waterLevelRaw()),
      sample: sampleWaterLevel,
    }),
  );

  app.get(
    '/api/key-stations',
    serve({
      key: 'key-stations',
      source: THAIWATER,
      enabled: () => !!config.thaiwater.waterLevelUrl && config.thaiwater.keyStationCodes.length > 0,
      load: async () => parseKeyStations(await waterLevelRaw(), config.thaiwater.keyStationCodes),
      sample: sampleKeyStations,
    }),
  );

  app.get(
    '/api/rain',
    serve({
      key: 'rain',
      source: THAIWATER,
      enabled: () => !!config.thaiwater.rainUrl,
      load: async () => parseRain(await getJson(config.thaiwater.rainUrl)),
      sample: sampleRain,
    }),
  );

  app.get(
    '/api/floodgates',
    serve({
      key: 'floodgates',
      source: THAIWATER,
      enabled: () => !!config.thaiwater.floodgateUrl,
      load: async () => parseFloodgates(await getJson(config.thaiwater.floodgateUrl)),
      sample: sampleFloodgates,
    }),
  );

  app.get(
    '/api/flood-forecast',
    serve({
      key: 'flood-forecast',
      source: FLOODHUB,
      enabled: () => !!config.floodhub.apiKey,
      load: async () => {
        const { apiKey, baseUrl, regionCode, bbox } = config.floodhub;
        const pages = await fetchFloodStatusPages(baseUrl, apiKey, regionCode, post);
        return parseFloodStatuses(pages, bbox);
      },
      sample: sampleFloodForecasts,
    }),
  );

  app.get('/api/links', (c) => {
    c.header('cache-control', 'public, max-age=3600');
    return c.json({ cameras: CAMERA_LINKS, official: OFFICIAL_LINKS });
  });

  return app;
}
