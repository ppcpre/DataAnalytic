import { describe, expect, it } from 'vitest';
import { parseStreamBridge, parseStreamBridgeSession } from '../src/adapters/streambridge.js';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { STREAMBRIDGE_BODY } from './fixtures.js';

describe('streambridge cameras', () => {
  it('pins online cameras with their latest snapshot from the StreamBridge domain only', () => {
    const out = parseStreamBridge(STREAMBRIDGE_BODY, 'bangkruai-city');
    expect(out.map((c) => c.id)).toEqual(['sb-4aac4b3e-b18a-49a3-903b-e3ad9f960a44', 'sb-evil']);
    expect(out[0]).toEqual({
      id: 'sb-4aac4b3e-b18a-49a3-903b-e3ad9f960a44',
      name: 'แยกเทิดพระเกียรติ กล้อง 1',
      road: 'เทศบาลเมืองบางกรวย',
      location: { lat: 13.80272, lng: 100.47725, province: '12', provinceName: 'นนทบุรี' },
      owner: 'เทศบาลเมืองบางกรวย',
      url: 'https://app.streambridge.online/p/bangkruai-city',
      via: 'StreamBridge',
      hlsSessionUrl: '/api/streambridge/bangkruai-city/4aac4b3e-b18a-49a3-903b-e3ad9f960a44/session',
      imageUrl: 'https://app.streambridge.online/snapshots/4aac4b3e-b18a-49a3-903b-e3ad9f960a44.jpg',
      imageTakenAt: '2026-10-01T13:09:41.887Z',
      imageCredit: 'เทศบาลเมืองบางกรวย',
    });
    // ภาพจากโดเมนอื่นไม่นำมาแสดง และรหัสกล้องที่ไม่ใช่ UUID ไม่มีภาพสด
    expect(out[1].imageUrl).toBeUndefined();
    expect(out[1].hlsSessionUrl).toBeUndefined();
    expect(parseStreamBridge(null, 'x')).toEqual([]);
  });

  it('pins Saensuk (Bang Saen) cameras in Chonburi, a camera-only province', () => {
    const id = '11111111-2222-4333-8444-555555555555';
    const out = parseStreamBridge(
      {
        title: 'เทศบาลเมืองแสนสุข',
        subtitle: 'ระบบกล้องวงจรปิดรักษาความปลอดภัย หาดบางแสน',
        cameras: [
          { id, name: 'บางแสนสาย1 (โรงแรมเอสทู) #1', status: 'online', latitude: 13.2838, longitude: 100.9156 },
          { id: 'zero', name: 'พิกัดผิด', status: 'online', latitude: 0, longitude: 0 },
        ],
      },
      'saensuk',
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: `sb-${id}`,
      location: { lat: 13.2838, lng: 100.9156, province: '20', provinceName: 'ชลบุรี' },
      hlsSessionUrl: `/api/streambridge/saensuk/${id}/session`,
      url: 'https://app.streambridge.online/p/saensuk',
    });
    expect(loadConfig({}).cameras.streamBridgeSlugs).toEqual(['bangkruai-city', 'saensuk']);
  });
});

describe('streambridge live session', () => {
  const CAM = '4aac4b3e-b18a-49a3-903b-e3ad9f960a44';
  const HLS = 'https://app.streambridge.online/hls/abc.def.ghi/live/x/y.m3u8';

  it('accepts only HLS links on the StreamBridge domain', () => {
    expect(parseStreamBridgeSession({ hlsUrl: HLS, expiresAt: 'x' })).toBe(HLS);
    expect(parseStreamBridgeSession({ hlsUrl: 'https://evil.example/hls/x.m3u8' })).toBeUndefined();
    expect(parseStreamBridgeSession(null)).toBeUndefined();
  });

  it('requests a session only for configured sites and camera ids', async () => {
    const posted: string[] = [];
    const app = createApp(loadConfig({}), undefined, undefined, {
      postSession: async (url) => {
        posted.push(url);
        return { hlsUrl: HLS, expiresAt: '2026-10-02T02:00:00.000Z' };
      },
    });
    const ok = await app.request(`/api/streambridge/bangkruai-city/${CAM}/session`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toBe('no-store');
    expect(await ok.json()).toEqual({ hlsUrl: HLS });
    expect(posted).toEqual([`https://app.streambridge.online/api/public/bangkruai-city/cameras/${CAM}/session`]);
    expect((await app.request(`/api/streambridge/other-city/${CAM}/session`)).status).toBe(404);
    expect((await app.request('/api/streambridge/bangkruai-city/not-a-uuid/session')).status).toBe(404);
    expect(posted).toHaveLength(1);
  });
});
