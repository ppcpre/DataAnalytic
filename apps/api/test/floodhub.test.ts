import { describe, expect, it, vi } from 'vitest';
import { fetchFloodStatusPages, parseFloodStatuses } from '../src/adapters/floodhub.js';

const bbox = { minLat: 13.3, minLng: 99.7, maxLat: 15.9, maxLng: 101.2 };

describe('parseFloodStatuses', () => {
  it('maps severity to status and filters by bbox', () => {
    const out = parseFloodStatuses(
      [
        {
          floodStatuses: [
            {
              gaugeId: 'hybas_1',
              gaugeLocation: { latitude: 14.3, longitude: 100.5 },
              severity: 'SEVERE',
              forecastTrend: 'RISE',
              issuedTime: '2026-09-26T00:00:00Z',
              forecastTimeRange: { start: '2026-09-27T00:00:00Z', end: '2026-09-28T00:00:00Z' },
            },
            // นอกกรอบพื้นที่ (เชียงใหม่)
            { gaugeId: 'hybas_2', gaugeLocation: { latitude: 18.8, longitude: 98.9 }, severity: 'EXTREME' },
            { gaugeId: 'hybas_3', gaugeLocation: { latitude: 13.9, longitude: 100.4 }, severity: 'WEIRD' },
          ],
        },
        null,
      ],
      bbox,
    );
    expect(out.map((f) => f.id)).toEqual(['gfh-hybas_1', 'gfh-hybas_3']);
    expect(out[0]).toMatchObject({ severity: 'SEVERE', status: 'warning', trend: 'RISE', forecastEnd: '2026-09-28T00:00:00Z' });
    expect(out[1]).toMatchObject({ severity: 'UNKNOWN', status: 'unknown' });
  });
});

describe('fetchFloodStatusPages', () => {
  it('follows nextPageToken and sends region code', async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce({ floodStatuses: [], nextPageToken: 'p2' })
      .mockResolvedValueOnce({ floodStatuses: [] });
    const pages = await fetchFloodStatusPages('https://x.test', 'KEY', 'TH', post);
    expect(pages).toHaveLength(2);
    expect(post.mock.calls[0][0]).toBe('https://x.test/v1/floodStatus:searchLatestFloodStatusByArea?key=KEY');
    expect(post.mock.calls[1][1]).toMatchObject({ regionCode: 'TH', pageToken: 'p2' });
  });
});
