import { describe, expect, it } from 'vitest';
import { alongRoute, routeMeasurer, type RouteCoords } from '../src/route';
import { initialSelection, toggleSelection } from '../src/multiview';

// เส้นทางตรงขึ้นเหนือ ~11 กม. แล้วเลี้ยวตะวันออก ~10.8 กม.
const ROUTE: RouteCoords = [
  [13.75, 100.5],
  [13.85, 100.5],
  [13.85, 100.6],
];

describe('route check geometry', () => {
  it('measures distance to the route and position along it', () => {
    const m = routeMeasurer(ROUTE);
    expect(m.lengthKm).toBeCloseTo(11.06 + 10.81, 0);
    const mid = m.measure({ lat: 13.8, lng: 100.505 });
    expect(mid.distKm).toBeCloseTo(0.54, 1);
    expect(mid.alongKm).toBeCloseTo(5.53, 1);
    const end = m.measure({ lat: 13.85, lng: 100.6 });
    expect(end.distKm).toBeCloseTo(0, 3);
    expect(end.alongKm).toBeCloseTo(m.lengthKm, 3);
  });

  it('keeps items within the buffer, ordered from the start', () => {
    const items = [
      { id: 'east-end', location: { lat: 13.851, lng: 100.59 } },
      { id: 'near-start', location: { lat: 13.76, lng: 100.501 } },
      { id: 'far', location: { lat: 13.8, lng: 100.56 } },
      { id: 'off-route-box', location: { lat: 14.5, lng: 100.5 } },
    ];
    expect(alongRoute(items, ROUTE, 0.5).map((h) => h.item.id)).toEqual(['near-start', 'east-end']);
    expect(() => alongRoute(items, [[13.7, 100.5]], 1)).toThrow();
  });
});

describe('multi-camera selection', () => {
  it('restores a saved selection that still exists, else the first cameras', () => {
    expect(initialSelection(['a', 'b', 'c'], ['c', 'x', 'c'])).toEqual(['c']);
    expect(initialSelection(['a', 'b', 'c', 'd', 'e'], [])).toEqual(['a', 'b', 'c', 'd']);
    expect(initialSelection(['a'], ['x'])).toEqual(['a']);
  });

  it('toggles up to the maximum', () => {
    expect(toggleSelection(['a', 'b'], 'a')).toEqual(['b']);
    expect(toggleSelection(['a', 'b', 'c', 'd'], 'e')).toEqual(['a', 'b', 'c', 'd']);
    expect(toggleSelection(['a'], 'b')).toEqual(['a', 'b']);
  });
});
