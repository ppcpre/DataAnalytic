import { describe, expect, it } from 'vitest';
import { createRelay, relayGet } from '../src/relay.js';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const KEY = 'k'.repeat(32);

describe('relay (runs on a machine in Thailand)', () => {
  const calls: string[] = [];
  const relay = createRelay({
    key: KEY,
    fetch: (async (url: string) => {
      calls.push(url);
      return new Response(new Uint8Array([0xff, 0xd8, 1]), { headers: { 'content-type': 'image/jpeg' } });
    }) as unknown as typeof fetch,
  });
  const get = (path: string, key = KEY) => relay.request(path, { headers: { 'x-relay-key': key } });

  it('refuses requests without the shared key', async () => {
    expect((await get('/bmatraffic?path=/', 'wrong')).status).toBe(401);
    expect((await relay.request('/bmatraffic?path=/')).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it('forwards only the allowed targets and paths', async () => {
    const ok = await get(`/bmatraffic?path=${encodeURIComponent('/show.aspx?image=1692&&time=1792582402000')}`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/jpeg');
    expect(calls).toEqual(['http://www.bmatraffic.com/show.aspx?image=1692&&time=1792582402000']);
    expect((await get('/bmatraffic?path=/admin.aspx')).status).toBe(400);
    expect((await get(`/bmatraffic?path=${encodeURIComponent('/@evil.example/')}`)).status).toBe(400);
    expect((await get('/elsewhere?path=/')).status).toBe(404);
    expect(calls).toHaveLength(1);
  });

  it('rejects a short key', () => {
    expect(() => createRelay({ key: 'short' })).toThrow();
  });

  it('is used by the API for BMA traffic when configured, and turns the source on', async () => {
    const viaRelay = (async (url: string, init?: RequestInit) => relay.request(url.replace('https://relay.example', ''), init)) as unknown as typeof fetch;
    const res = await relayGet('https://relay.example/', KEY, 'bmatraffic', '/', viaRelay);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(new Uint8Array([0xff, 0xd8, 1]));
    await expect(relayGet('https://relay.example', 'wrong', 'bmatraffic', '/', viaRelay)).rejects.toThrow('relay HTTP 401');
    expect(loadConfig({ RELAY_URL: 'https://relay.example', RELAY_KEY: KEY }).cameras.bmaTraffic).toBe('auto');
    expect(loadConfig({ RELAY_URL: 'https://relay.example', RELAY_KEY: KEY, BMA_TRAFFIC: 'off' }).cameras.bmaTraffic).toBe('off');
    expect(loadConfig({}).cameras.bmaTraffic).toBe('off');
    expect(createApp).toBeTypeOf('function');
  });
});
