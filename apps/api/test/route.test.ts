import { describe, expect, it } from 'vitest';
import { osrmRouteUrl, parseOsrmRoute, parsePoint, straightKm } from '../src/adapters/route.js';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const OSRM = {
  code: 'Ok',
  routes: [{ distance: 12345, duration: 1500, geometry: { type: 'LineString', coordinates: [[100.5, 13.75], [100.51, 13.76], [100.52, 13.8]] } }],
};

describe('route check', () => {
  it('accepts points only inside the service area', () => {
    expect(parsePoint('13.75,100.5')).toEqual({ lat: 13.75, lng: 100.5 });
    expect(parsePoint(' 12.708,100.973 ')).toEqual({ lat: 12.708, lng: 100.973 });
    expect(parsePoint('48.85,2.35')).toBeUndefined();
    expect(parsePoint('13.75')).toBeUndefined();
    expect(parsePoint('13.75,100.5;drop')).toBeUndefined();
    expect(Math.round(straightKm({ lat: 13.75, lng: 100.5 }, { lat: 13.85, lng: 100.5 }))).toBe(11);
  });

  it('builds an OSRM request and reads its route as lat,lng', () => {
    expect(osrmRouteUrl('https://router.example/', { lat: 13.75, lng: 100.5 }, { lat: 13.8, lng: 100.52 })).toBe(
      'https://router.example/route/v1/driving/100.5,13.75;100.52,13.8?overview=full&geometries=geojson&alternatives=false&steps=false',
    );
    expect(parseOsrmRoute(OSRM)).toEqual({ coordinates: [[13.75, 100.5], [13.76, 100.51], [13.8, 100.52]], distanceKm: 12.3, durationMin: 25 });
    expect(parseOsrmRoute({ code: 'NoRoute', routes: [] })).toBeUndefined();
    expect(parseOsrmRoute(null)).toBeUndefined();
  });

  it('serves /api/route and rejects bad or far requests', async () => {
    const asked: string[] = [];
    const app = createApp(loadConfig({ ROUTER_URL: 'https://router.example' }), async (url) => {
      asked.push(url);
      return OSRM;
    });
    const ok = await app.request('/api/route?from=13.7501,100.5002&to=13.8,100.52');
    expect(ok.status).toBe(200);
    expect((await ok.json()).data.distanceKm).toBe(12.3);
    expect(asked).toEqual(['https://router.example/route/v1/driving/100.5002,13.7501;100.52,13.8?overview=full&geometries=geojson&alternatives=false&steps=false']);
    // เส้นทางเดิมใช้ cache
    await app.request('/api/route?from=13.7501,100.5002&to=13.8,100.52');
    expect(asked).toHaveLength(1);
    expect((await app.request('/api/route?from=48.8,2.3&to=13.8,100.52')).status).toBe(400);
    expect((await app.request('/api/route?from=13.75,100.5&to=16.4,102.2')).status).toBe(400);
    expect((await createApp(loadConfig({ ROUTER_URL: '' })).request('/api/route?from=13.75,100.5&to=13.8,100.5')).status).toBe(404);
  });
});
