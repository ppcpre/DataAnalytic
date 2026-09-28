import { describe, expect, it } from 'vitest';
import { CAMERAS } from '../src/data/cameras.js';
import { NONT_STATIC } from '../src/data/nonthaburi.js';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { NONT_BODY, PAKKRET_HTML } from './fixtures.js';

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
      loadConfig({ NONT_API_BASE: 'http://nont.example' }),
      async (url) => {
        urls.push(url);
        if (url.startsWith('http://nont.example/')) return NONT_BODY;
        return {
          item: [
            { camid: 'ITICM_BMAMI0123', title: '(กรุงเทพมหานคร) แยกตัวอย่าง', latitude: '13.75', longitude: '100.5', geocode: '103605', organization: 'กทม.' },
            { camid: 'DOH-PER-10-006', title: '(จ.หนองบัวลำภู) นอกพื้นที่', latitude: '17.2', longitude: '102.3', geocode: '390113' },
          ],
        };
      },
      undefined,
      { getText: async () => PAKKRET_HTML },
    );
    const live = await (await app.request('/api/cameras')).json();
    expect(urls.sort()).toEqual(['http://nont.example/json.php?app=station', 'https://traffic.longdo.com/camera.json']);
    const fromList = live.data.filter((c: { id: string }) => c.id.startsWith('longdo-'));
    expect(fromList.map((c: { name: string; url: string }) => [c.name, c.url])).toEqual([
      ['แยกตัวอย่าง', 'https://traffic.longdo.com/camera?vdo=i123'],
    ]);
    // กล้อง/จุดวัดที่เพิ่มเองใน data/cameras.ts แสดงร่วมด้วยเสมอ
    const ids = live.data.map((c: { id: string }) => c.id);
    expect(ids).toEqual(expect.arrayContaining([...CAMERAS.map((c) => c.id), 'nont-STN2', 'pakkret-eon-001']));
    expect(live.data.length).toBe(CAMERAS.length + 4); // Longdo 1 + นนทบุรี 2 + ปากเกร็ด 1

    // แหล่งใดล่ม ยังแสดงแหล่งที่เหลือ และจุดของนนทบุรีใช้รายชื่อที่บันทึกไว้
    const down = async () => {
      throw new Error('down');
    };
    for (const env of [{}, { NONT_API_BASE: 'http://nont.example' }]) {
      const off = await (
        await createApp(loadConfig({ CAMERA_LIST_URL: '', ...env }), down, undefined, { getText: down }).request('/api/cameras')
      ).json();
      expect(off.data).toEqual([...CAMERAS, ...NONT_STATIC]);
    }
    const sample = await (await createApp(loadConfig({ DATA_MODE: 'sample' })).request('/api/cameras')).json();
    expect(sample.data.length).toBeGreaterThan(0);
  });

  it('rejects camera names that are not in the Nonthaburi format', async () => {
    const app = createApp(loadConfig({ NONT_API_BASE: 'http://nont.example' }));
    expect((await app.request('/api/nont/image?cam=http://evil.example/x')).status).toBe(400);
    expect((await app.request('/api/nont/image?cam=A1-x%26width=9')).status).toBe(400);
    expect((await app.request('/api/nont/image')).status).toBe(400);
    // ไม่ได้ตั้งแหล่งภาพ
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
