import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

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
    const app = createApp(loadConfig({}), async () => ({
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
  it('serves an empty camera list by default and sample cameras in sample mode', async () => {
    const live = await (await createApp(loadConfig({})).request('/api/cameras')).json();
    expect(live.data).toEqual([]);
    const sample = await (await createApp(loadConfig({ DATA_MODE: 'sample' })).request('/api/cameras')).json();
    expect(sample.data.length).toBeGreaterThan(0);
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
