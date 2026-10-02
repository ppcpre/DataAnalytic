import { describe, expect, it } from 'vitest';
import { parseStreamBridge } from '../src/adapters/streambridge.js';
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
      imageUrl: 'https://app.streambridge.online/snapshots/4aac4b3e-b18a-49a3-903b-e3ad9f960a44.jpg',
      imageTakenAt: '2026-10-01T13:09:41.887Z',
      imageCredit: 'เทศบาลเมืองบางกรวย',
    });
    // ภาพจากโดเมนอื่นไม่นำมาแสดง
    expect(out[1].imageUrl).toBeUndefined();
    expect(parseStreamBridge(null, 'x')).toEqual([]);
  });
});
