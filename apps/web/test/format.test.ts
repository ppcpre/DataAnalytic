import { describe, expect, it } from 'vitest';
import { distanceKm, escapeHtml, formatAgo, formatPlace } from '../src/format';

describe('format helpers', () => {
  it('escapes html from upstream data', () => {
    expect(escapeHtml('<img src=x onerror="a">')).toBe('&lt;img src=x onerror=&quot;a&quot;&gt;');
  });

  it('formats relative time in Thai', () => {
    const now = Date.parse('2026-09-26T10:00:00Z');
    expect(formatAgo('2026-09-26T09:45:00Z', now)).toBe('15 นาทีที่แล้ว');
    expect(formatAgo('2026-09-26T07:00:00Z', now)).toBe('3 ชั่วโมงที่แล้ว');
  });

  it('formats place with province name', () => {
    expect(formatPlace('10', 'พระนคร')).toBe('พระนคร, กรุงเทพมหานคร');
  });

  it('computes distance', () => {
    const d = distanceKm({ lat: 13.7563, lng: 100.5018 }, { lat: 13.8621, lng: 100.5144 });
    expect(d).toBeGreaterThan(11);
    expect(d).toBeLessThan(12.5);
  });
});

describe('new helpers', async () => {
  const { formatDistance, highlight } = await import('../src/format');
  it('formats distance in metres or km', () => {
    expect(formatDistance(0.347)).toBe('350 ม.');
    expect(formatDistance(1.84)).toBe('1.8 กม.');
  });
  it('highlights the query safely', () => {
    expect(highlight('ถนนลาดพร้าว', 'ลาดพร้าว')).toBe('ถนน<b>ลาดพร้าว</b>');
    expect(highlight('<x>', 'z')).toBe('&lt;x&gt;');
  });
});
