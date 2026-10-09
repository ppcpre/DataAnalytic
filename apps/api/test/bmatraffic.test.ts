import { describe, expect, it } from 'vitest';
import { isRealBmaFrame, parseBmaTraffic } from '../src/adapters/bmatraffic.js';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

/** หน้าแรกของ bmatraffic.com (ย่อ) */
const BMA_HTML = `<script type='text/javascript'>
 var locations = [  ['603','BR-05-01 แยกสีลม-นราธิวาส','Silom-Naradhiwas Intersection','แยกสีลม-นราธิวาส','From Surasak Intersection',13.7262,100.52797,'10.104.101.29','pin-right.png'],
 ['1692','ถ.บรมราชชนนี ตัด ถ.ราชพฤกษ์','-','ถ.บรมราชชนนี ตัด ถ.ราชพฤกษ์','-',13.78221,100.44695,'10.156.101.40','pin-right.png'],
 ['1295','TF1-PC-02\tถนนเพชรเกษม ตัด ถนนราชพฤกษ์','-','ถนนเพชรเกษม ตัด ถนนราชพฤกษ์','-',13.71474,100.45081,'10.156.101.20','pin-right.png'],
 ['1692','ซ้ำ','-','ซ้ำ','-',13.78,100.44,'x','pin-right.png'],
 ['9','นอกพื้นที่','-','x','-',44.125485,100.494949,'x','pin-right.png'] ];
</script>`;

const BLANK = new Uint8Array(1456).fill(0x89);
const FRAME = new Uint8Array(30000).fill(1);
FRAME[0] = 0xff;
FRAME[1] = 0xd8;

describe('bmatraffic cameras', () => {
  it('reads camera ids, names and coordinates from the home page', () => {
    const out = parseBmaTraffic(BMA_HTML);
    expect(out.map((c) => [c.id, c.name])).toEqual([
      ['bma-603', 'แยกสีลม-นราธิวาส'],
      ['bma-1692', 'ถ.บรมราชชนนี ตัด ถ.ราชพฤกษ์'],
      ['bma-1295', 'ถนนเพชรเกษม ตัด ถนนราชพฤกษ์'],
    ]);
    expect(out[1]).toMatchObject({
      location: { lat: 13.78221, lng: 100.44695, province: '10' },
      url: 'http://www.bmatraffic.com/PlayVideo.aspx?ID=1692',
      imageUrl: '/api/bma/image?id=1692',
    });
    expect(parseBmaTraffic('<html></html>')).toEqual([]);
  });

  it('tells real JPEG frames from the blank maintenance image', () => {
    expect(isRealBmaFrame(FRAME)).toBe(true);
    expect(isRealBmaFrame(BLANK)).toBe(false);
  });

  const appWith = (frame: Uint8Array, env: Record<string, string> = { BMA_TRAFFIC: 'auto' }) => {
    const fetched: string[] = [];
    const app = createApp(loadConfig({ CAMERA_LIST_URL: '', RANGSIT_LIVE: 'false', STREAMBRIDGE_SLUGS: '', NONT_LIVE: 'false', ...env }), async () => ({}), undefined, {
      getText: async (url) => (url.includes('bmatraffic') ? BMA_HTML : ''),
      getImage: async (url) => {
        fetched.push(url);
        return { status: 200, type: 'image/jpeg', body: frame };
      },
    });
    return { app, fetched };
  };
  const bmaIds = async (app: ReturnType<typeof createApp>) =>
    ((await (await app.request('/api/cameras')).json()).data as { id: string }[]).filter((c) => c.id.startsWith('bma-')).length;

  it('stays hidden while the source sends blank images', async () => {
    const { app } = appWith(BLANK);
    expect(await bmaIds(app)).toBe(0);
    expect(await (await app.request('/api/bma/status')).json()).toMatchObject({ mode: 'auto', show: false, live: false, cameras: 3 });
    expect((await app.request('/api/bma/image?id=1692')).status).toBe(502);
  });

  it('shows the cameras once real frames come back, and proxies their images', async () => {
    const { app, fetched } = appWith(FRAME);
    expect(await bmaIds(app)).toBe(3);
    const img = await app.request('/api/bma/image?id=1692');
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/jpeg');
    expect(fetched.at(-1)).toMatch(/^http:\/\/www\.bmatraffic\.com\/show\.aspx\?image=1692&&time=\d+$/);
    expect((await app.request('/api/bma/image?id=../x')).status).toBe(400);
  });

  it('uses the socket getter for page and images when provided', async () => {
    const paths: string[] = [];
    const app = createApp(loadConfig({ CAMERA_LIST_URL: '', RANGSIT_LIVE: 'false', STREAMBRIDGE_SLUGS: '', NONT_LIVE: 'false', BMA_TRAFFIC: 'auto' }), async () => ({}), undefined, {
      getText: async () => '',
      bmaGet: async (path) => {
        paths.push(path);
        const body = path === '/' ? new TextEncoder().encode(BMA_HTML) : FRAME;
        return { status: 200, headers: { 'content-type': 'image/jpeg' }, body };
      },
    });
    expect(await bmaIds(app)).toBe(3);
    expect(paths[0]).toBe('/');
    expect(paths[1]).toMatch(/^\/show\.aspx\?image=603&&time=\d+$/);
  });

  it('is off by default', async () => {
    const { app, fetched } = appWith(FRAME, {});
    expect(await bmaIds(app)).toBe(0);
    expect(await (await app.request('/api/bma/status')).json()).toEqual({ mode: 'off', show: false });
    expect(fetched).toEqual([]);
  });

  it('can be forced on or off', async () => {
    expect(await bmaIds(appWith(BLANK, { BMA_TRAFFIC: 'on' }).app)).toBe(3);
    const off = appWith(FRAME, { BMA_TRAFFIC: 'off' });
    expect(await bmaIds(off.app)).toBe(0);
    expect(off.fetched).toEqual([]);
  });
});
