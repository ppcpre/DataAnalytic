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

  it('lists CCTV links', async () => {
    const app = createApp(loadConfig({ DATA_MODE: 'sample' }));
    const body = await (await app.request('/api/links')).json();
    expect(body.cameras.length).toBeGreaterThan(0);
  });
});
