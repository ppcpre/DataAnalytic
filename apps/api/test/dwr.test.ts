import { describe, expect, it } from 'vitest';
import { dwrSnapshotPath, parseDwrList, parseDwrStation } from '../src/adapters/dwr.js';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { DWR_LIST, DWR_STATION } from './fixtures.js';

describe('dwr telemetry cameras', () => {
  it('keeps online stations in the provinces the app shows cameras for', () => {
    expect(parseDwrList(DWR_LIST)).toEqual([
      { code: 'TA100220', name: 'สะพานพระพุทธยอดฟ้า', province: '10', provinceName: 'กรุงเทพมหานคร', district: 'ธนบุรี' },
    ]);
    expect(parseDwrList(null)).toEqual([]);
  });

  it('builds a live MJPEG camera with the water level and its thresholds', () => {
    const [item] = parseDwrList(DWR_LIST);
    expect(parseDwrStation(item, DWR_STATION)).toEqual({
      id: 'dwr-TA100220',
      name: 'สะพานพระพุทธยอดฟ้า',
      road: 'แม่น้ำเจ้าพระยา · ธนบุรี',
      location: { lat: 13.738694, lng: 100.49633, province: '10', provinceName: 'กรุงเทพมหานคร' },
      owner: 'กรมทรัพยากรน้ำ',
      url: 'https://telemetry.dwr.go.th/station/TA100220',
      streamUrl: '/api/dwr/live?code=TA100220',
      imageUrl: '/api/dwr/image?code=TA100220',
      imageTakenAt: '2026-10-10T00:30:00.000Z',
      imageCredit: 'กรมทรัพยากรน้ำ',
      kind: 'water',
      readings: [{ label: 'ระดับน้ำ (ม.รทก.)', value: 1.68, unit: 'ม.', warning: 1.2, danger: 1.46, historyId: 'dwr-TA100220' }],
      observedAt: '2026-10-10T00:29:00.000Z',
    });
    // รหัสไม่ตรงกับรายชื่อ หรือไม่มีพิกัด → ไม่ปักหมุด
    expect(parseDwrStation({ ...item, code: 'TA999999' }, DWR_STATION)).toBeUndefined();
    expect(parseDwrStation(item, { value: {} })).toBeUndefined();
    expect(dwrSnapshotPath(DWR_STATION)).toBe('/TA100220/2026/10/10/7_30.jpg');
    // เกณฑ์เฝ้าระวังที่ต่ำกว่าระดับทะเลปานกลางไม่นำมาใช้
    const tidal = { value: { ...DWR_STATION.value, fullCon: { entity: { ...DWR_STATION.value.fullCon.entity, wlFw: -2.93 } } } };
    expect(parseDwrStation(item, tidal)?.readings?.[0]).toEqual({ label: 'ระดับน้ำ (ม.รทก.)', value: 1.68, unit: 'ม.', danger: 1.46, historyId: 'dwr-TA100220' });
  });

  it('proxies the latest still image through a POST to the source', async () => {
    const calls: unknown[] = [];
    const app = createApp(loadConfig({}), async () => DWR_STATION, undefined, {
      getImage: async (url, body) => {
        calls.push([url, body]);
        return { status: 200, type: 'image/jpeg', body: new Uint8Array([0xff, 0xd8, 1]) };
      },
    });
    const res = await app.request('/api/dwr/image?code=TA100220');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(calls).toEqual([['https://telemetry.dwr.go.th/api/file/image/cctv', { path: '/TA100220/2026/10/10/7_30.jpg' }]]);
    expect((await app.request('/api/dwr/image?code=../x')).status).toBe(400);
    expect((await createApp(loadConfig({ DWR_LIVE: 'false' })).request('/api/dwr/image?code=TA100220')).status).toBe(404);
  });

  it('relays the live MJPEG stream so other sites can show it', async () => {
    const opened: string[] = [];
    const app = createApp(loadConfig({}), undefined, undefined, {
      openStream: async (url) => {
        opened.push(url);
        return new Response('--frame\r\n', { headers: { 'content-type': 'multipart/x-mixed-replace; boundary=frame' } });
      },
    });
    const res = await app.request('/api/dwr/live?code=TA100222');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('multipart/x-mixed-replace; boundary=frame');
    expect(res.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(opened).toEqual(['https://telemetry.dwr.go.th/cctv/mjpeg/TA100222']);
    expect((await app.request('/api/dwr/live?code=x')).status).toBe(400);
    const off = createApp(loadConfig({}), undefined, undefined, {
      openStream: async () => new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } }),
    });
    expect((await off.request('/api/dwr/live?code=TA100222')).status).toBe(502);
  });
});
