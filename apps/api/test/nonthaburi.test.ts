import { describe, expect, it } from 'vitest';
import { NONT_CAMERA_NAME, nontImageUrl, parseNonthaburiStations } from '../src/adapters/nonthaburi.js';
import { parsePakkretEon } from '../src/adapters/pakkret.js';
import { NONT_BODY, PAKKRET_HTML } from './fixtures.js';

const NOW = new Date('2026-09-28T08:00:00Z').getTime(); // 15:00 เวลาไทย

describe('nonthaburi stations', () => {
  it('pins stations with cameras and keeps only recent readings', () => {
    const out = parseNonthaburiStations(NONT_BODY, NOW);
    expect(out.map((c) => c.id)).toEqual(['nont-STN2', 'nont-STN1']);
    const [a2, a1] = out;
    expect(a2).toMatchObject({
      name: 'วัดตำหนักใต้',
      road: 'จุด A2 · กล้อง 2 ตัว (แสดงตัวแรก)',
      location: { lat: 13.886683, lng: 100.488564, province: '12' },
      url: 'http://182.52.224.70/?page=station&id=STN2',
      imageUrl: `/api/nont/image?cam=${encodeURIComponent('A2-วัดตำหนักใต้ Cam1')}`,
      kind: 'water',
      observedAt: '2026-09-28T07:30:00.000Z',
    });
    expect(a2.readings).toEqual([
      { label: 'ระดับน้ำด้านเหนือประตู', value: 1.12, unit: 'ม.', warning: 1.5, danger: 2 },
      { label: 'ระดับน้ำด้านท้ายประตู', value: 1.84, unit: 'ม.', warning: 1.5, danger: 2.5 },
      { label: 'ฝนสะสมวันนี้', value: 43.8, unit: 'มม.', warning: 30, danger: 90 },
    ]);
    // ไม่นำชื่อผู้ดูแลจุด (address) มาแสดง
    expect(JSON.stringify(a2)).not.toContain('ชื่อผู้ดูแล');
    // ค่าวัดเก่าหลายปี ไม่แสดง แต่ยังปักหมุดเพื่อดูภาพกล้อง
    expect(a1.readings).toBeUndefined();
    expect(parseNonthaburiStations(null)).toEqual([]);
  });

  it('only accepts camera names in the source format', () => {
    expect(NONT_CAMERA_NAME.test('A1-คลองท่าทราย Cam1')).toBe(true);
    expect(NONT_CAMERA_NAME.test('B12-คลองขุด ข้าง กสท.')).toBe(true);
    for (const bad of ['http://x', 'A1-x&width=1', 'A1-../x', 'x', 'A1-%2F']) expect(NONT_CAMERA_NAME.test(bad)).toBe(false);
    expect(nontImageUrl('A1-ก Cam1')).toBe(
      'http://182.52.224.70/MilestoneImageService/ImageService.svc/ImageService/GetImage?width=800&height=450&cameraname=A1-%E0%B8%81%20Cam1',
    );
  });
});

describe('pak kret water sensor', () => {
  it('reads the sensor list, snapshot and historic high marks from the page', () => {
    expect(parsePakkretEon(PAKKRET_HTML)).toEqual([
      {
        id: 'pakkret-eon-001',
        name: 'ท่าน้ำปากเกร็ด (เซนเซอร์ระดับน้ำ)',
        road: 'แม่น้ำเจ้าพระยา · สถานะ: เฝ้าระวัง · สูงสุดปี 54: 3.38 ม. · สูงสุดปี 65: 2.84 ม.',
        location: { lat: 13.9153, lng: 100.4947, province: '12', provinceName: 'นนทบุรี' },
        owner: 'เทศบาลนครปากเกร็ด',
        url: 'https://www.pakkretconnect.com/liffwater/eon',
        imageUrl: 'https://www.pakkretconnect.com/snapshots/192.168.21.66/192.168.21.66.jpg',
        imageCredit: 'Pak Kret Connect',
        embedUrl: 'https://www.pakkretconnect.com/liffwater/eon',
        kind: 'water',
        readings: [{ label: 'ระดับน้ำ', value: 1.9, unit: 'ม.' }],
        observedAt: '2026-09-28T07:45:05.000Z',
      },
    ]);
    expect(parsePakkretEon('<html></html>')).toEqual([]);
  });
});
