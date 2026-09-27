import { describe, expect, it } from 'vitest';
import type { WaterLevelStation } from '@flood-watch/shared';
import { computeTrend, HOUR, MemoryHistoryStore, recordAndAttachTrends, type Reading } from '../src/history.js';

const T0 = Date.parse('2026-09-27T12:00:00Z');
const r = (hoursAgo: number, level: number | null, percent: number | null = null): Reading => ({
  stationId: 's1',
  t: T0 - hoursAgo * HOUR,
  level,
  percent,
});

describe('computeTrend', () => {
  it('compares with the reading closest to 3 hours ago', () => {
    const t = computeTrend(r(0, 2.1), [r(5, 1.5), r(3, 1.9), r(1, 2.05)]);
    expect(t).toEqual({ direction: 'rise', change: 0.2, unit: 'm', sinceHours: 3 });
  });

  it('reports falling and steady levels', () => {
    expect(computeTrend(r(0, 1.8), [r(3, 1.9)])?.direction).toBe('fall');
    expect(computeTrend(r(0, 1.81), [r(3, 1.8)])?.direction).toBe('steady');
  });

  it('falls back to percent when levels are missing', () => {
    expect(computeTrend(r(0, null, 80), [r(3, null, 70)])).toMatchObject({ direction: 'rise', unit: '%', change: 10 });
  });

  it('returns null without a usable past reading', () => {
    expect(computeTrend(r(0, 2), [])).toBeNull();
    expect(computeTrend(r(0, 2), [r(0.5, 1.5), r(9, 1)])).toBeNull();
  });
});

describe('recordAndAttachTrends', () => {
  const station = (observedAt: number, levelMsl: number): WaterLevelStation => ({
    id: 's1',
    name: 'ก',
    location: { lat: 13.7, lng: 100.5, province: '10' },
    observedAt: new Date(observedAt).toISOString(),
    levelMsl,
    bankMsl: 2,
    percent: (levelMsl / 2) * 100,
    status: 'normal',
    agency: 'x',
  });

  it('builds history over successive loads and ignores duplicates', async () => {
    const store = new MemoryHistoryStore();
    const first = await recordAndAttachTrends(store, [station(T0 - 3 * HOUR, 1.5)], T0 - 3 * HOUR);
    expect(first[0].trend).toBeNull();
    await recordAndAttachTrends(store, [station(T0 - 3 * HOUR, 1.5)], T0 - 3 * HOUR);
    const later = await recordAndAttachTrends(store, [station(T0, 1.8)], T0);
    expect(later[0].trend).toMatchObject({ direction: 'rise', change: 0.3 });
    expect(await store.series('s1', 0)).toHaveLength(2);
  });

  it('prunes old readings', async () => {
    const store = new MemoryHistoryStore();
    await store.record([r(10, 1), r(1, 2)]);
    await store.prune(T0 - 5 * HOUR);
    expect(await store.series('s1', 0)).toHaveLength(1);
  });
});
