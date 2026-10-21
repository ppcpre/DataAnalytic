import { describe, expect, it } from 'vitest';
import { parsePopnixCanals, parsePopnixHistory, parsePopnixRoads, popnixHistoryUrl, popnixTime } from '../src/adapters/popnix.js';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const OVERVIEW = {
  summary: { stations: 4 },
  stations: [
    { id: 265, name: 'ค.กระเฉด', river: 'คลองกระเฉด', lat: 13.85826, lng: 100.62848, warn: -0.4, crit: -0.2, wl: -1.16, measured_at: '2026-10-21 18:35:00', online: true, level: 'ok' },
    { id: 125, name: 'ค.พระยาสุเรนทร์', river: 'คลองพระยาสุเรนทร์', lat: 13.87621, lng: 100.68614, warn: 1.2, crit: 1.0, wl: 1.55, measured_at: '2026-10-21 18:30:00', online: true },
    { id: 7, name: 'ออฟไลน์', lat: 13.8, lng: 100.6, wl: 0.5, online: false },
    { id: 8, name: 'ไม่มีค่า', lat: 13.8, lng: 100.6, wl: null, online: true },
  ],
};

const ROADS = {
  roads: [
    { code: 'FL.MBR.02', kind: 1, name: 'ถ.สุวินทวงศ์ (ถ.หทัยราษฎร์)', road: 'ถนนสุวินทวงศ์', district: 'มีนบุรี', lat: 13.81, lng: 100.73, depth: 20, level: 'flood', measured_at: '2026-10-21 18:25:00' },
    { code: 'FL.BBN.01', kind: 1, name: 'ถ.เอกชัย', district: 'บางบอน', lat: 13.67942, lng: 100.43563, depth: 0, level: 'dry' },
    { code: 'TN.01', kind: 2, name: 'อุโมงค์ตัวอย่าง', district: 'ดินแดง', lat: 13.76, lng: 100.55, depth: 7, level: 'slight' },
  ],
};

describe('popnix (BMA canals and road flooding)', () => {
  it('reads Thai local times', () => {
    expect(popnixTime('2026-10-21 18:35:00')).toBe('2026-10-21T11:35:00.000Z');
    expect(popnixTime('x')).toBeUndefined();
  });

  it('pins online canal stations with their thresholds and the required credit', () => {
    const out = parsePopnixCanals(OVERVIEW);
    expect(out.map((c) => c.id)).toEqual(['pop-c265', 'pop-c125']);
    expect(out[0]).toMatchObject({
      name: 'ค.กระเฉด',
      road: 'คลองกระเฉด · จุดวัดระดับน้ำคลอง กทม.',
      location: { lat: 13.85826, lng: 100.62848, province: '10' },
      owner: 'สำนักการระบายน้ำ กทม.',
      url: 'https://flood.pop.in.th/',
      kind: 'water',
      readings: [{ label: 'ระดับน้ำคลอง (ม.รทก.)', value: -1.16, unit: 'ม.', warning: -0.4, danger: -0.2, historyId: 'pop-c265' }],
      observedAt: '2026-10-21T11:35:00.000Z',
    });
    expect(out[0].attribution).toContain('สำนักการระบายน้ำ กรุงเทพมหานคร ผ่าน POPNIX Flood');
    // เกณฑ์เฝ้าระวังสูงกว่าวิกฤต (ข้อมูลกลับด้าน) → ใช้เฉพาะเกณฑ์วิกฤต
    expect(out[1].readings?.[0].warning).toBeUndefined();
    expect(parsePopnixCanals(null)).toEqual([]);
  });

  it('pins only roads and tunnels that are flooded', () => {
    const out = parsePopnixRoads(ROADS);
    expect(out.map((c) => [c.id, c.road, c.readings?.[0].value])).toEqual([
      ['pop-rFL.MBR.02', 'ถนนสุวินทวงศ์ · เขตมีนบุรี · น้ำท่วมถนน', 0.2],
      ['pop-rTN.01', 'อุโมงค์ · เขตดินแดง · น้ำท่วมถนน', 0.07],
    ]);
    expect(out[1].readings?.[0].label).toBe('ความลึกน้ำในอุโมงค์');
  });

  it('serves canal history from the source', async () => {
    const urls: string[] = [];
    const now = Date.now();
    const fmt = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 19).replace('T', ' ');
    const app = createApp(loadConfig({}), async (url) => {
      urls.push(url);
      return { id: 265, points: [{ t: fmt(now - 2 * 3600_000), wl: -1.2 }, { t: fmt(now - 3600_000), wl: -1.16 }, { t: 'bad', wl: 1 }] };
    });
    const body = await (await app.request('/api/history/pop-c265?hours=168')).json();
    expect(body.data.map((p: { levelMsl: number }) => p.levelMsl)).toEqual([-1.2, -1.16]);
    expect(urls).toEqual(['https://flood.pop.in.th/api_history.php?id=265&h=168']);
    expect(popnixHistoryUrl('1', 24)).toBe('https://flood.pop.in.th/api_history.php?id=1&h=24');
    expect(parsePopnixHistory(null)).toEqual([]);
  });
});
