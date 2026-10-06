import { describe, expect, it } from 'vitest';
import { MAX_FAVORITES, loadFavorites, storeFavorites, toggleFavorite } from '../src/favorites';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('favorite cameras', () => {
  it('adds newest first, removes on second toggle, and survives a reload', () => {
    const s = mem();
    let list = toggleFavorite([], { id: 'a', name: 'กล้อง A', owner: 'กทม.' }, 1);
    list = toggleFavorite(list, { id: 'b', name: 'กล้อง B', owner: 'บางกรวย' }, 2);
    expect(list.map((f) => f.id)).toEqual(['b', 'a']);
    expect(storeFavorites(list, s)).toBe(true);
    expect(loadFavorites(s)).toEqual(list);
    expect(toggleFavorite(list, { id: 'b', name: 'x', owner: 'y' }).map((f) => f.id)).toEqual(['a']);
  });

  it('ignores broken storage and caps the list', () => {
    expect(loadFavorites({ getItem: () => '{oops' })).toEqual([]);
    expect(loadFavorites({ getItem: () => JSON.stringify([{ id: 1 }, null, { id: 'ok', name: 'n', owner: 'o', savedAt: 1 }]) })).toHaveLength(1);
    expect(loadFavorites(null)).toEqual([]);
    expect(storeFavorites([], null)).toBe(false);
    let list: ReturnType<typeof toggleFavorite> = [];
    for (let i = 0; i < MAX_FAVORITES + 5; i++) list = toggleFavorite(list, { id: `c${i}`, name: 'n', owner: 'o' });
    expect(list).toHaveLength(MAX_FAVORITES);
    expect(list[0].id).toBe(`c${MAX_FAVORITES + 4}`);
  });
});
