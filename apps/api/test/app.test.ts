import { describe, expect, it } from 'vitest';
import { CAMERAS } from '../src/data/cameras.js';
import { NONT_STATIC } from '../src/data/nonthaburi.js';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { NONT_BODY, PAKKRET_HTML, STREAMBRIDGE_BODY } from './fixtures.js';

const nontJson = (path: string) => {
  if (path !== '/json.php?app=station') throw new Error(`unexpected ${path}`);
  return { status: 200, headers: { 'content-type': 'application/json' }, body: new TextEncoder().encode(` ${JSON.stringify(NONT_BODY)}`) };
};

describe('api', () => {
  it('serves sample data flagged as sample', async () => {
    const app = createApp(loadConfig({ DATA_MODE: 'sample' }));
    const res = await app.request('/api/water-level');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sample).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('proxies and normalises live data', async () => {
    const app = createApp(loadConfig({ MAX_READING_AGE_HOURS: '1000000' }), async () => ({
      data: [
        {
          rain_24h: 12,
          rainfall_datetime: '2026-09-26 07:00',
          station: { id: 1, tele_station_name: { th: 'ก' }, tele_station_lat: 13.7, tele_station_long: 100.5 },
          geocode: { province_code: '10' },
        },
      ],
    }));
    const body = await (await app.request('/api/rain')).json();
    expect(body).toMatchObject({ sample: false, stale: false });
    expect(body.data[0]).toMatchObject({ name: 'ก', rain24h: 12, status: 'watch' });
  });

  it('drops readings older than MAX_READING_AGE_HOURS', async () => {
    const thai = (hoursAgo: number) =>
      new Date(Date.now() - hoursAgo * 3600_000 + 7 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
    const rec = (id: number, hoursAgo: number) => ({
      rain_24h: 20,
      rainfall_datetime: thai(hoursAgo),
      station: { id, tele_station_name: 'x', tele_station_lat: 13.7, tele_station_long: 100.5 },
      geocode: { province_code: '10' },
    });
    const app = createApp(loadConfig({}), async () => ({ data: [rec(1, 1), rec(2, 96)] }));
    const body = await (await app.request('/api/rain')).json();
    expect(body.data.map((d: { id: string }) => d.id)).toEqual(['tw-rain-1']);
  });

  it('returns 502 when upstream fails and nothing is cached', async () => {
    const app = createApp(loadConfig({}), async () => {
      throw new Error('boom');
    });
    const res = await app.request('/api/water-level');
    expect(res.status).toBe(502);
  });

  it('returns an empty list when the floodgate source is not configured', async () => {
    const app = createApp(loadConfig({}));
    const body = await (await app.request('/api/floodgates')).json();
    expect(body.data).toEqual([]);
  });

  it('shares one upstream water-level fetch between endpoints', async () => {
    let calls = 0;
    const app = createApp(loadConfig({}), async () => {
      calls++;
      return { data: [] };
    });
    await app.request('/api/water-level');
    await app.request('/api/key-stations');
    expect(calls).toBe(1);
  });

  it('keeps flood forecast disabled without an API key', async () => {
    const post = async () => {
      throw new Error('should not be called');
    };
    const app = createApp(loadConfig({}), async () => ({}), post);
    const body = await (await app.request('/api/flood-forecast')).json();
    expect(body.data).toEqual([]);
  });

  it('fetches flood forecast when an API key is configured', async () => {
    const post = async () => ({
      floodStatuses: [{ gaugeId: 'g1', gaugeLocation: { latitude: 14, longitude: 100.5 }, severity: 'EXTREME' }],
    });
    const app = createApp(loadConfig({ GOOGLE_FLOOD_API_KEY: 'k' }), async () => ({}), post);
    const body = await (await app.request('/api/flood-forecast')).json();
    expect(body.data[0]).toMatchObject({ id: 'gfh-g1', status: 'critical' });
  });

  it('lists CCTV links', async () => {
    const app = createApp(loadConfig({ DATA_MODE: 'sample' }));
    const body = await (await app.request('/api/links')).json();
    expect(body.cameras.length).toBeGreaterThan(0);
  });
});

describe('cameras and geocode', () => {
  it('serves cameras from every source and sample cameras in sample mode', async () => {
    const urls: string[] = [];
    const app = createApp(
      loadConfig({}),
      async (url) => {
        urls.push(url);
        if (url.startsWith('https://app.streambridge.online/')) return STREAMBRIDGE_BODY;
        return {
          item: [
            { camid: 'ITICM_BMAMI0123', title: '(กรุงเทพมหานคร) แยกตัวอย่าง', latitude: '13.75', longitude: '100.5', geocode: '103605', organization: 'กทม.' },
            { camid: 'DOH-PER-10-006', title: '(จ.หนองบัวลำภู) นอกพื้นที่', latitude: '17.2', longitude: '102.3', geocode: '390113' },
          ],
        };
      },
      undefined,
      { getText: async () => PAKKRET_HTML, nontGet: async (path) => nontJson(path) },
    );
    const live = await (await app.request('/api/cameras')).json();
    expect(urls.sort()).toEqual(['https://app.streambridge.online/api/public/bangkruai-city', 'https://traffic.longdo.com/camera.json']);
    const fromList = live.data.filter((c: { id: string }) => c.id.startsWith('longdo-'));
    expect(fromList.map((c: { name: string; url: string }) => [c.name, c.url])).toEqual([
      ['แยกตัวอย่าง', 'https://traffic.longdo.com/camera?vdo=i123'],
    ]);
    // กล้อง/จุดวัดที่เพิ่มเองใน data/cameras.ts แสดงร่วมด้วยเสมอ
    const ids = live.data.map((c: { id: string }) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([...CAMERAS.map((c) => c.id), 'nont-STN2', 'pakkret-eon-001', 'sb-4aac4b3e-b18a-49a3-903b-e3ad9f960a44']),
    );
    // Longdo 1 + นนทบุรี 2 (เซนเซอร์ถนนค่าเก่าไม่แสดง) + ปากเกร็ด 1 + บางกรวย 2
    expect(live.data.length).toBe(CAMERAS.length + 6);

    // แหล่งใดล่ม ยังแสดงแหล่งที่เหลือ และจุดของนนทบุรีใช้รายชื่อที่บันทึกไว้
    const down = async () => {
      throw new Error('down');
    };
    for (const deps of [{ getText: down }, { getText: down, nontGet: down }]) {
      const off = await (await createApp(loadConfig({ CAMERA_LIST_URL: '' }), down, undefined, deps).request('/api/cameras')).json();
      expect(off.data).toEqual([...CAMERAS, ...NONT_STATIC]);
    }
    // ปิดการดึงสดด้วย NONT_LIVE=false
    const noLive = createApp(loadConfig({ CAMERA_LIST_URL: '', NONT_LIVE: 'false' }), down, undefined, {
      getText: down,
      nontGet: async (path) => nontJson(path),
    });
    expect((await (await noLive.request('/api/cameras')).json()).data).toEqual([...CAMERAS, ...NONT_STATIC]);
    const sample = await (await createApp(loadConfig({ DATA_MODE: 'sample' })).request('/api/cameras')).json();
    expect(sample.data.length).toBeGreaterThan(0);
  });

  it('passes Nonthaburi camera images through, only for names in the source format', async () => {
    const paths: string[] = [];
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const app = createApp(loadConfig({}), undefined, undefined, {
      nontGet: async (path) => {
        paths.push(path);
        return path.includes('Cam1')
          ? { status: 200, headers: { 'content-type': 'image/jpeg' }, body: jpeg }
          : { status: 200, headers: {} as Record<string, string>, body: new Uint8Array() };
      },
    });
    const ok = await app.request('/api/nont/image?cam=A1-%E0%B8%81%20Cam1');
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/jpeg');
    expect(new Uint8Array(await ok.arrayBuffer())).toEqual(jpeg);
    expect(paths[0]).toBe(
      '/MilestoneImageService/ImageService.svc/ImageService/GetImage?width=800&height=450&cameraname=A1-%E0%B8%81%20Cam1',
    );
    // กล้องออฟไลน์ (ตอบ 200 แต่ไม่มีภาพ)
    expect((await app.request('/api/nont/image?cam=A1-x%20Cam2')).status).toBe(502);
    expect((await app.request('/api/nont/image?cam=http://evil.example/x')).status).toBe(400);
    expect((await app.request('/api/nont/image?cam=A1-x%26width=9')).status).toBe(400);
    expect((await app.request('/api/nont/image')).status).toBe(400);
    expect(paths).toHaveLength(2);
    // ไม่มีช่องทางดึงภาพ
    expect((await createApp(loadConfig({})).request('/api/nont/image?cam=A1-x%20Cam1')).status).toBe(404);
  });

  it('proxies place search, restricted to the service area, and caches it', async () => {
    const urls: string[] = [];
    const app = createApp(loadConfig({}), async (url) => {
      urls.push(url);
      return {
        features: [
          {
            geometry: { coordinates: [100.56, 13.81] },
            properties: { name: 'ลาดพร้าว', osm_value: 'suburb', city: 'กรุงเทพมหานคร', osm_type: 'R', osm_id: 1 },
          },
        ],
      };
    });
    const body = await (await app.request('/api/geocode?q=%E0%B8%A5%E0%B8%B2%E0%B8%94%E0%B8%9E%E0%B8%A3%E0%B9%89%E0%B8%B2%E0%B8%A7')).json();
    expect(body.data[0]).toMatchObject({ name: 'ลาดพร้าว', detail: 'กรุงเทพมหานคร', lat: 13.81, lng: 100.56 });
    expect(urls[0]).toContain('bbox=99.8%2C13.4%2C100.95%2C14.3');
    await app.request('/api/geocode?q=%E0%B8%A5%E0%B8%B2%E0%B8%94%E0%B8%9E%E0%B8%A3%E0%B9%89%E0%B8%B2%E0%B8%A7');
    expect(urls).toHaveLength(1);
  });

  it('ignores too-short queries', async () => {
    const app = createApp(loadConfig({}), async () => {
      throw new Error('should not be called');
    });
    expect((await (await app.request('/api/geocode?q=a')).json()).data).toEqual([]);
  });
});

describe('history endpoint', () => {
  it('serves sample history ending at the current value, with trends on sample stations', async () => {
    const app = createApp(loadConfig({ DATA_MODE: 'sample' }));
    const stations = (await (await app.request('/api/water-level')).json()).data;
    const s = stations[3];
    expect(s.trend).toBeTruthy();
    const hist = (await (await app.request(`/api/history/${s.id}?hours=6`)).json()).data;
    expect(hist.length).toBe(13);
    expect(hist[hist.length - 1].percent).toBeCloseTo(s.percent, 0);
  });

  it('serves recorded readings in live mode', async () => {
    // เวลาวัด 1 ชม.ก่อน ในรูปแบบเวลาไทยของ ThaiWater
    const observed = new Date(Math.floor((Date.now() - 3600_000) / 60_000) * 60_000);
    const thai = new Date(observed.getTime() + 7 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
    const app = createApp(loadConfig({}), async () => ({
      data: [
        {
          waterlevel_datetime: thai,
          waterlevel_msl: 1.5,
          station: { id: 7, tele_station_name: 'ก', tele_station_lat: 13.7, tele_station_long: 100.5, min_bank: 2 },
          geocode: { province_code: '10' },
        },
      ],
    }));
    await app.request('/api/water-level');
    const body = await (await app.request('/api/history/tw-wl-7?hours=24')).json();
    expect(body.data).toEqual([{ t: observed.toISOString(), levelMsl: 1.5, percent: 75 }]);
  });
});

describe('history stats', () => {
  it('reports what the history store holds', async () => {
    const app = createApp(loadConfig({}));
    const body = await (await app.request('/api/history/stats')).json();
    expect(body).toEqual({ store: 'memory', rows: 0, stations: 0, first: null, last: null, bySource: {} });
  });
});
