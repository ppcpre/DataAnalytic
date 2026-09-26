import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ApiResponse } from '@flood-watch/shared';
import { TtlCache } from './cache.js';
import type { Config } from './config.js';
import { fetchJson, UpstreamError } from './http.js';
import { parseFloodgates, parseRain, parseWaterLevel } from './adapters/thaiwater.js';
import { sampleFloodgates, sampleRain, sampleWaterLevel } from './adapters/sample.js';
import { CAMERA_LINKS, OFFICIAL_LINKS } from './links.js';

type Fetcher = (url: string) => Promise<unknown>;

interface Dataset<T> {
  key: string;
  url: () => string;
  parse: (body: unknown) => T[];
  sample: () => T[];
}

export function createApp(config: Config, fetcher: Fetcher = fetchJson) {
  const cache = new TtlCache(config.cacheTtlMs, config.staleMaxMs);
  const app = new Hono();

  app.use(
    '/api/*',
    cors({ origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',').map((s) => s.trim()) }),
  );

  function serve<T>(ds: Dataset<T>) {
    return async (c: import('hono').Context) => {
      c.header('cache-control', 'public, max-age=60');
      if (config.dataMode === 'sample') {
        const body: ApiResponse<T> = {
          data: ds.sample(),
          source: 'ข้อมูลตัวอย่าง (ไม่ใช่ข้อมูลจริง)',
          fetchedAt: new Date().toISOString(),
          sample: true,
          stale: false,
        };
        return c.json(body);
      }
      const url = ds.url();
      if (!url) {
        const body: ApiResponse<T> = {
          data: [],
          source: 'ยังไม่ได้ตั้งค่าแหล่งข้อมูล',
          fetchedAt: new Date().toISOString(),
          sample: false,
          stale: false,
        };
        return c.json(body);
      }
      try {
        const result = await cache.get(ds.key, async () => ds.parse(await fetcher(url)));
        const body: ApiResponse<T> = {
          data: result.value,
          source: 'คลังข้อมูลน้ำแห่งชาติ (ThaiWater)',
          fetchedAt: result.fetchedAt.toISOString(),
          sample: false,
          stale: result.stale,
        };
        return c.json(body);
      } catch (err) {
        const message = err instanceof UpstreamError ? err.message : 'เกิดข้อผิดพลาดในการดึงข้อมูล';
        console.error(`[${ds.key}]`, err);
        return c.json({ error: message }, 502);
      }
    };
  }

  app.get('/api/health', (c) => c.json({ ok: true, dataMode: config.dataMode }));

  app.get(
    '/api/water-level',
    serve({
      key: 'water-level',
      url: () => config.thaiwater.waterLevelUrl,
      parse: parseWaterLevel,
      sample: sampleWaterLevel,
    }),
  );

  app.get(
    '/api/rain',
    serve({ key: 'rain', url: () => config.thaiwater.rainUrl, parse: parseRain, sample: sampleRain }),
  );

  app.get(
    '/api/floodgates',
    serve({
      key: 'floodgates',
      url: () => config.thaiwater.floodgateUrl,
      parse: parseFloodgates,
      sample: sampleFloodgates,
    }),
  );

  app.get('/api/links', (c) => {
    c.header('cache-control', 'public, max-age=3600');
    return c.json({ cameras: CAMERA_LINKS, official: OFFICIAL_LINKS });
  });

  return app;
}
