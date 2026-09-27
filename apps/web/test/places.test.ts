import { describe, expect, it } from 'vitest';
import { loadPlaces, storePlaces, summarizeArea, type NearbyInput } from '../src/places';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('saved places storage', () => {
  it('round-trips and drops invalid entries', () => {
    const s = mem();
    storePlaces([{ id: 'a', label: 'บ้าน', name: 'x', detail: '', lat: 13.7, lng: 100.5 }], s);
    expect(loadPlaces(s)).toHaveLength(1);
    s.setItem('fw.places.v1', JSON.stringify([{ id: 'b' }, 'junk']));
    expect(loadPlaces(s)).toEqual([]);
    s.setItem('fw.places.v1', '{bad json');
    expect(loadPlaces(s)).toEqual([]);
  });

  it('works without storage', () => {
    expect(loadPlaces(null)).toEqual([]);
    expect(storePlaces([], null)).toBe(false);
  });
});

describe('summarizeArea', () => {
  const st = (id: string, status: NearbyInput['status'], lat: number): NearbyInput => ({
    kind: 'water',
    id,
    name: id,
    status,
    text: '',
    location: { lat, lng: 100.5 },
  });

  it('keeps stations within the radius, worst first', () => {
    const r = summarizeArea({ lat: 13.7, lng: 100.5 }, [
      st('near-normal', 'normal', 13.701),
      st('near-warning', 'warning', 13.71),
      st('far-critical', 'critical', 13.9),
    ]);
    expect(r.items.map((i) => i.id)).toEqual(['near-warning', 'near-normal']);
    expect(r.worst).toBe('warning');
    expect(r.counts.warning).toBe(1);
  });

  it('reports unknown when nothing is nearby', () => {
    expect(summarizeArea({ lat: 13.7, lng: 100.5 }, []).worst).toBe('unknown');
  });
});
