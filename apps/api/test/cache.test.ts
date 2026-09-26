import { describe, expect, it, vi } from 'vitest';
import { TtlCache } from '../src/cache.js';

describe('TtlCache', () => {
  it('serves cached value within ttl and refetches after', async () => {
    let t = 0;
    const cache = new TtlCache(1000, 5000, () => t);
    const load = vi.fn().mockResolvedValueOnce('a').mockResolvedValueOnce('b');
    expect((await cache.get('k', load)).value).toBe('a');
    t = 500;
    expect((await cache.get('k', load)).value).toBe('a');
    t = 1500;
    expect((await cache.get('k', load)).value).toBe('b');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('returns stale value when refresh fails, then gives up after staleMax', async () => {
    let t = 0;
    const cache = new TtlCache(1000, 5000, () => t);
    await cache.get('k', async () => 'a');
    t = 2000;
    const r = await cache.get('k', async () => {
      throw new Error('down');
    });
    expect(r).toMatchObject({ value: 'a', stale: true });
    t = 6000;
    await expect(
      cache.get('k', async () => {
        throw new Error('down');
      }),
    ).rejects.toThrow('down');
  });

  it('dedupes concurrent loads', async () => {
    const cache = new TtlCache(1000, 5000);
    const load = vi.fn(async () => 'x');
    await Promise.all([cache.get('k', load), cache.get('k', load)]);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
