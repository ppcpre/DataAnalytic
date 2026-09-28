import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import type { ApiResponse, Camera } from '@flood-watch/shared';
import { TtlCache } from './cache.js';
import type { Config } from './config.js';
import { fetchJson, fetchText, postJson, UpstreamError } from './http.js';
import { parseFloodgates, parseKeyStations, parseRain, parseWaterLevel } from './adapters/thaiwater.js';
import { fetchFloodStatusPages, parseFloodStatuses } from './adapters/floodhub.js';
import { geocodeUrl, parsePhoton } from './adapters/geocode.js';
import { CAMERAS } from './data/cameras.js';
import { parseLongdoCameras } from './adapters/longdo.js';
import { PAKKRET_EON_URL, parsePakkretEon } from './adapters/pakkret.js';
import { NONT_CAMERA_NAME, NONT_STATIONS_PATH, nontImagePath, parseNonthaburiStations } from './adapters/nonthaburi.js';
import type { RawResponse } from './raw-http.js';
import { NONT_STATIC } from './data/nonthaburi.js';
import { HOUR, MemoryHistoryStore, recordAndAttachTrends, type HistoryStore } from './history.js';
import {
  sampleCameras,
  sampleFloodForecasts,
  sampleFloodgates,
  sampleHistory,
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

export interface AppDeps {
  history?: HistoryStore;
  /** ดึงหน้าเว็บแบบข้อความ (แทนได้ในการทดสอบ) */
  getText?: (url: string) => Promise<string>;
  /** GET ไปที่เซิร์ฟเวอร์ของเทศบาลนครนนทบุรี (path เช่น /json.php?…) — ไม่มี = ใช้รายชื่อจุดที่บันทึกไว้ */
  nontGet?: (path: string) => Promise<RawResponse>;
}

export function createApp(
  config: Config,
  getJson: GetJson = fetchJson,
  post: PostJson = postJson,
  deps: AppDeps = {},
) {
  const history = deps.history ?? new MemoryHistoryStore();
  const getText = deps.getText ?? fetchText;
  /** ตัดค่าวัดที่เก่าเกิน (เช่น สถานีที่หยุดส่งข้อมูลไปหลายวัน) */
  const fresh = <T extends { observedAt: string }>(list: T[]): T[] => {
    const cutoff = Date.now() - config.maxReadingAgeHours * 3600_000;
    return list.filter((x) => new Date(x.observedAt).getTime() >= cutoff);
  };
  const cache = new TtlCache(config.cacheTtlMs, config.staleMaxMs);
  const geocodeCache = new TtlCache(config.geocode.cacheTtlMs, config.geocode.cacheTtlMs);
  // รายชื่อกล้องเปลี่ยนไม่บ่อย เก็บนานกว่าข้อมูลน้ำ และใช้ค่าเก่าได้ถึง 7 วันถ้าต้นทางล่ม
  const cameraCache = new TtlCache(config.cameras.cacheTtlMs, 7 * 24 * 3600_000);
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
      cameras: config.dataMode === 'sample' || CAMERAS.length > 0 || !!config.cameras.listUrl,
      geocode: !!config.geocode.url,
    }),
  );

  app.get(
    '/api/water-level',
    serve({
      key: 'water-level',
      source: THAIWATER,
      enabled: () => !!config.thaiwater.waterLevelUrl,
      load: async () => recordAndAttachTrends(history, fresh(parseWaterLevel(await waterLevelRaw()))),
      sample: sampleWaterLevel,
    }),
  );

  app.get(
    '/api/key-stations',
    serve({
      key: 'key-stations',
      source: THAIWATER,
      enabled: () => !!config.thaiwater.waterLevelUrl && config.thaiwater.keyStationCodes.length > 0,
      load: async () =>
        recordAndAttachTrends(history, fresh(parseKeyStations(await waterLevelRaw(), config.thaiwater.keyStationCodes))),
      sample: sampleKeyStations,
    }),
  );

  app.get(
    '/api/rain',
    serve({
      key: 'rain',
      source: THAIWATER,
      enabled: () => !!config.thaiwater.rainUrl,
      load: async () => fresh(parseRain(await getJson(config.thaiwater.rainUrl))),
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

  /**
   * จุดเฝ้าระวังของเทศบาลนครนนทบุรี — ค่าระดับน้ำเปลี่ยนทุก 15 นาที จึงใช้ cache เดียวกับข้อมูลน้ำ
   * ดึงสดไม่ได้/ไม่ได้ตั้งค่า ใช้รายชื่อจุดที่บันทึกไว้ (ลิงก์ไปดูภาพในเว็บเทศบาล)
   */
  const nontGet = config.cameras.nontLive ? deps.nontGet : undefined;
  const nontStations = async () => {
    if (!nontGet) return NONT_STATIC;
    try {
      const r = await cache.get('nont-stations', async () => {
        const res = await nontGet(NONT_STATIONS_PATH);
        if (res.status !== 200) throw new UpstreamError(`ต้นทางตอบกลับ HTTP ${res.status}`, 'nonthaburi');
        return parseNonthaburiStations(JSON.parse(new TextDecoder().decode(res.body)));
      });
      return r.value.length ? r.value : NONT_STATIC;
    } catch (err) {
      console.error('[cameras] nonthaburi', err);
      return NONT_STATIC;
    }
  };

  /**
   * ภาพกล้องของเทศบาลนครนนทบุรี (ต้นทางเป็น http จึงส่งต่อผ่าน https ที่นี่)
   * รับเฉพาะชื่อกล้องตามรูปแบบของต้นทาง และดึงจากเซิร์ฟเวอร์ที่กำหนดไว้เท่านั้น
   */
  app.get('/api/nont/image', async (c) => {
    const cam = c.req.query('cam') ?? '';
    if (!NONT_CAMERA_NAME.test(cam)) return c.json({ error: 'ชื่อกล้องไม่ถูกต้อง' }, 400);
    if (!nontGet) return c.json({ error: 'ยังไม่ได้ตั้งค่าแหล่งภาพ' }, 404);
    try {
      const res = await nontGet(nontImagePath(cam));
      const type = res.headers['content-type'] ?? '';
      const body = new Uint8Array(res.body); // สำเนาแบบ ArrayBuffer ธรรมดา
      // ต้นทางตอบ 200 แต่ไม่มีภาพเมื่อกล้องออฟไลน์
      if (res.status !== 200 || !type.startsWith('image/') || body.byteLength === 0) {
        return c.json({ error: 'กล้องนี้ไม่มีภาพขณะนี้' }, 502);
      }
      return c.body(body, 200, { 'content-type': type, 'cache-control': 'public, max-age=10' });
    } catch (err) {
      console.error('[nont-image]', err);
      return c.json({ error: 'ดึงภาพจากกล้องไม่สำเร็จ' }, 502);
    }
  });

  app.get(
    '/api/cameras',
    serve({
      key: 'cameras',
      source: 'Longdo Traffic / มูลนิธิ iTIC / เทศบาลนครนนทบุรี',
      enabled: () => true,
      load: async () => {
        const url = config.cameras.listUrl;
        // ดึงแต่ละแหล่งแยกกัน แหล่งใดล่ม ยังแสดงกล้อง/จุดวัดจากแหล่งอื่นได้
        const [fromList, fromNont, fromPakkret] = await Promise.all([
          (url ? cameraCache.get('longdo-cameras', () => getJson(url)) : Promise.resolve({ value: null }))
            .then((r) => parseLongdoCameras(r.value))
            .catch((err: unknown) => {
              console.error('[cameras] longdo', err);
              return [] as Camera[];
            }),
          nontStations(),
          cache
            // เก็บเฉพาะผลที่แยกแล้ว หน้าเว็บต้นทางใหญ่ (~400 KB เพราะฝังภาพไว้ในหน้า)
            .get('pakkret-eon', async () => parsePakkretEon(await getText(PAKKRET_EON_URL)))
            .then((r) => r.value)
            .catch((err: unknown) => {
              console.error('[cameras] pakkret', err);
              return [] as Camera[];
            }),
        ]);
        const own = new Set(CAMERAS.map((c) => c.id));
        return [...CAMERAS, ...fromPakkret, ...fromNont, ...fromList.filter((c) => !own.has(c.id))];
      },
      sample: sampleCameras,
    }),
  );

  /** ระดับน้ำย้อนหลังของสถานี (สูงสุด 7 วัน) */
  app.get('/api/history/:id', async (c) => {
    const id = c.req.param('id');
    const hours = Math.min(168, Math.max(1, Number(c.req.query('hours') ?? 24) || 24));
    c.header('cache-control', 'public, max-age=120');
    if (config.dataMode === 'sample') return c.json({ data: sampleHistory(id, hours), sample: true });
    try {
      const rows = await history.series(id, Date.now() - hours * HOUR);
      return c.json({
        data: rows.map((r) => ({ t: new Date(r.t).toISOString(), levelMsl: r.level, percent: r.percent })),
        sample: false,
      });
    } catch (err) {
      console.error('[history]', err);
      return c.json({ error: 'อ่านข้อมูลย้อนหลังไม่สำเร็จ' }, 502);
    }
  });

  /** ค้นหาสถานที่ (ผ่านเซิร์ฟเวอร์เพื่อ cache ผลและไม่เรียกบริการต้นทางถี่เกินไป) */
  app.get('/api/geocode', async (c) => {
    const q = (c.req.query('q') ?? '').trim().slice(0, 100);
    if (q.length < 2) return c.json({ data: [] });
    if (!config.geocode.url) return c.json({ data: [] });
    const url = geocodeUrl(config.geocode.url, q, config.geocode.bbox);
    try {
      const result = await geocodeCache.get(`q:${q.toLowerCase()}`, async () => parsePhoton(await getJson(url)));
      c.header('cache-control', 'public, max-age=3600');
      return c.json({ data: result.value });
    } catch (err) {
      console.error('[geocode]', err);
      return c.json({ error: 'ค้นหาสถานที่ไม่สำเร็จ' }, 502);
    }
  });

  /**
   * ชั่วคราว: ตรวจว่าเซิร์ฟเวอร์เข้าถึงเว็บสำนักการระบายน้ำ กทม. ได้หรือไม่ (เว็บตัดการเชื่อมต่อจากต่างประเทศ)
   * ดึงเฉพาะ URL ที่กำหนดไว้ ไม่รับ URL จากผู้ใช้ — ลบออกเมื่อได้ข้อมูลโครงสร้างหน้าแล้ว
   */
  app.get('/api/debug/bma-water', async (c) => {
    c.header('cache-control', 'no-store');
    const colo = (c.req.raw as Request & { cf?: { colo?: string; country?: string } }).cf;
    const targets = [
      'https://weather.bangkok.go.th/water/StationDetail?id=73',
      'https://weather.bangkok.go.th/water',
    ];
    c.header('content-type', 'application/json; charset=utf-8');
    const results = [];
    for (const url of targets) {
      try {
        const res = await fetch(url, {
          headers: { 'user-agent': 'Mozilla/5.0 PreMonitoring', 'accept-language': 'th' },
          signal: AbortSignal.timeout(15000),
        });
        const html = await res.text();
        const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim();
        const uniq = (xs: string[], n: number) => [...new Set(xs)].slice(0, n);
        // ภาพทั้งหมด, ไฟล์ script และ URL ที่น่าจะเป็น API ในโค้ดของหน้า (ใช้หาที่มาของภาพระดับน้ำ)
        const imgs = uniq([...html.matchAll(/<img[^>]+src\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]), 25);
        const scripts = uniq([...html.matchAll(/<script[^>]+src\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]), 15);
        const apiHints = uniq(
          [...html.matchAll(/["'`]((?:https?:)?\/[^"'`\s]*(?:api|json|ashx|Get[A-Z]|Station|Cctv|CCTV|Image|image|snap|cam)[^"'`\s]*)["'`]/g)].map((m) => m[1]),
          30,
        );
        const text = html
          .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 500);
        results.push({ url, status: res.status, size: html.length, title, imgs, scripts, apiHints, text });
      } catch (err) {
        results.push({ url, error: String(err) });
      }
    }
    return c.json({ colo: colo?.colo, country: colo?.country, results });
  });

  app.get('/api/links', (c) => {
    c.header('cache-control', 'public, max-age=3600');
    return c.json({ cameras: CAMERA_LINKS, official: OFFICIAL_LINKS });
  });

  return app;
}
