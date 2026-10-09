import { describe, expect, it } from 'vitest';
import { jsonArrayAfter, parseRangsit } from '../src/adapters/rangsit.js';
import { RANGSIT_HTML } from './fixtures.js';

const NOW = Date.parse('2026-10-09T02:00:00Z');

describe('rangsit flood watch', () => {
  it('pins watch cameras with their live snapshot and alert level', () => {
    const out = parseRangsit(RANGSIT_HTML, NOW);
    expect(out.map((c) => c.id)).toEqual(['rs-cam-151', 'rs-cam-152', 'rs-rep-QZ6E7X494A', 'rs-rep-WVZAJAUDTU']);
    expect(out[0]).toEqual({
      id: 'rs-cam-151',
      name: 'กล้อง CCTV ตรวจวัดระดับน้ำสะพานแดง',
      road: 'คลองรังสิตประยูรศักดิ์ (สะพานแดง)',
      location: { lat: 13.98612855394923, lng: 100.6259594797345, province: '13', provinceName: 'ปทุมธานี' },
      owner: 'เทศบาลนครรังสิต',
      url: 'https://cdp.rangsitcity.go.th/',
      imageUrl: 'https://cdp.rangsitcity.go.th/api/flood/snapshot/151',
      imageCredit: 'เทศบาลนครรังสิต',
      kind: 'water',
      alert: { level: 'critical', label: 'วิกฤต', note: 'ป้ายจมน้ำทั้งแผ่น', at: '2026-10-09T01:52:12.966Z' },
    });
    expect(out[1].alert).toBeUndefined();
  });

  it('adds recent resident flood reports with photo, clip and depth', () => {
    const [, , knee, waist] = parseRangsit(RANGSIT_HTML, NOW);
    expect(knee).toMatchObject({
      name: 'รังสิต-นครนายก 13 ซอย 9',
      road: 'ประชาชนแจ้งน้ำท่วม · ระดับเข่า',
      imageUrl: 'https://cdp.rangsitcity.go.th/api/flood/image/QZ6E7X494A',
      videoUrl: 'https://cdp.rangsitcity.go.th/api/flood/video/QZ6E7X494A',
      imageTakenAt: '2026-10-07T15:07:16.510Z',
      alert: { level: 'watch', label: 'ระดับเข่า', at: '2026-10-07T15:07:16.510Z', reported: true },
    });
    expect(waist.videoUrl).toBeUndefined();
    expect(waist.alert).toEqual({ level: 'critical', label: 'ระดับเอว', note: 'รถเล็กไม่แนะนำ "ระวัง" [ลึก]', at: '2026-10-08T06:15:38.157Z', reported: true });
  });

  it('reads JSON arrays containing brackets inside strings', () => {
    expect(jsonArrayAfter('x "a":[{"t":"]}["},2] y', 'a')).toEqual([{ t: ']}[' }, 2]);
    expect(jsonArrayAfter('"a":[1,', 'a')).toBeUndefined();
    expect(parseRangsit('<html></html>')).toEqual([]);
  });
});
