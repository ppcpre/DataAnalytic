import { describe, expect, it } from 'vitest';
import { trendText } from '../src/chart';

describe('trendText', () => {
  it('describes rising level in centimetres', () => {
    expect(trendText({ direction: 'rise', change: 0.2, unit: 'm', sinceHours: 3 })).toBe('↑ สูงขึ้น 20 ซม. ใน 3 ชม.');
  });
  it('describes falling percent and steady states', () => {
    expect(trendText({ direction: 'fall', change: -4.5, unit: '%', sinceHours: 2.5 })).toBe('↓ ลดลง 4.5% ใน 2.5 ชม.');
    expect(trendText({ direction: 'steady', change: 0.01, unit: 'm', sinceHours: 3 })).toBe('→ ทรงตัวใน 3 ชม.ที่ผ่านมา');
  });
  it('returns arrows only in short form and empty without data', () => {
    expect(trendText({ direction: 'rise', change: 1, unit: 'm', sinceHours: 3 }, true)).toBe('↑');
    expect(trendText(null)).toBe('');
  });
});
