import { describe, expect, it } from 'vitest';
import { parseRadar, radarHtml } from '../src/radar';

const row = (radar_type: string, extra: Record<string, unknown> = {}) => ({
  radar_type,
  radar_name: `เรดาร์ ${radar_type}`,
  agency: 'bma',
  timezone: 'TST',
  media_datetime: '2026-10-01 11:25',
  filename: `${radar_type}.jpg`,
  media_path: `MP-${radar_type}`,
  media_path_thumb: `TH-${radar_type}`,
  ...extra,
});

describe('rain radar', () => {
  it('keeps the Bangkok-area radars in order with UTC image times', () => {
    const out = parseRadar({
      data: [
        row('cri240', { agency: 'tmd' }),
        row('svp120', { agency: 'tmd', timezone: 'UTC', media_datetime: '2026-10-01 11:20' }),
        row('njk'),
        row('nkm', { filename: 'nkm240_error.jpg' }),
      ],
    });
    expect(out.map((r) => r.type)).toEqual(['njk', 'svp120']);
    expect(out[0]).toMatchObject({
      agency: 'กรุงเทพมหานคร',
      takenAt: '2026-10-01T11:25:00.000Z',
      url: 'https://api-v3.thaiwater.net/api/v1/thaiwater30/shared/image?image=MP-njk',
      thumbUrl: 'https://api-v3.thaiwater.net/api/v1/thaiwater30/shared/image?image=TH-njk',
    });
    expect(out[1]).toMatchObject({ agency: 'กรมอุตุนิยมวิทยา', takenAt: '2026-10-01T11:20:00.000Z' });
    expect(parseRadar(null)).toEqual([]);
  });

  it('marks images that are many hours old', () => {
    const [r] = parseRadar({ data: [row('njk')] });
    expect(radarHtml([r], new Date('2026-10-01T11:50:00Z').getTime())).not.toContain('ไม่มีภาพใหม่');
    expect(radarHtml([r], new Date('2026-10-01T15:00:00Z').getTime())).toContain('ไม่มีภาพใหม่');
    expect(radarHtml([])).toBe('');
  });
});
