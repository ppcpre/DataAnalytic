import { describe, expect, it } from 'vitest';
import { dohHighwayCameras } from '../src/adapters/doh.js';
import { DOH_SITES } from '../src/data/doh-highway.js';

describe('highway department cameras', () => {
  it('builds cameras with live video and a direction switch for two-way sites', () => {
    const out = dohHighwayCameras([
      ['PER-16-013', '331 - สัตหีบ - เขาบายศรี', 'ทางหลวงแผ่นดินหมายเลข 331 ระหว่าง กม 2 - 3', 12.708532, 100.973536, '20', [['', 'ทิศทางมุ่งหน้าเข้า อ.สัตหีบ', 'https://streaming2.highwaytraffic.go.th/PER-16/PER_16_013.stream/playlist.m3u8']]],
      ['PER-3-004', 'ถ.เพชรเกษม อ้อมใหญ่', 'กม.26-27', 13.708, 100.2841, '73', [
        ['ขาเข้า', 'มุ่งหน้ากรุงเทพฯ', 'https://streaming1.highwaytraffic.go.th/PER-3/PER_3_004_IN.stream/playlist.m3u8'],
        ['ขาออก', 'มุ่งหน้านครปฐม', 'https://streaming1.highwaytraffic.go.th/PER-3/PER_3_004_OUT.stream/playlist.m3u8'],
      ]],
      // ลิงก์นอกเซิร์ฟเวอร์ของกรมทางหลวง และจังหวัดนอกพื้นที่ ไม่นำมาแสดง
      ['PER-X-1', 'ลิงก์อื่น', '', 13.7, 100.5, '10', [['', '', 'https://evil.example/playlist.m3u8']]],
      ['PER-X-2', 'นอกพื้นที่', '', 12.7, 101.2, '21', [['', '', 'https://streaming2.highwaytraffic.go.th/PER-5/PER_5_003.stream/playlist.m3u8']]],
    ]);
    expect(out.map((c) => c.id)).toEqual(['doh-PER-16-013', 'doh-PER-3-004']);
    expect(out[0]).toEqual({
      id: 'doh-PER-16-013',
      name: 'ทล.331 สัตหีบ - เขาบายศรี',
      road: 'ทางหลวงแผ่นดินหมายเลข 331 ระหว่าง กม 2 - 3 · ทิศทางมุ่งหน้าเข้า อ.สัตหีบ',
      location: { lat: 12.708532, lng: 100.973536, province: '20', provinceName: 'ชลบุรี' },
      owner: 'กรมทางหลวง',
      url: 'https://highwaytraffic.go.th/DOHWeb/Home.aspx',
      via: 'Highway Traffic',
      hlsUrl: 'https://streaming2.highwaytraffic.go.th/PER-16/PER_16_013.stream/playlist.m3u8',
      imageCredit: 'กรมทางหลวง',
    });
    expect(out[1].name).toBe('ถ.เพชรเกษม อ้อมใหญ่');
    expect(out[1].hlsUrl).toBe('https://streaming1.highwaytraffic.go.th/PER-3/PER_3_004_IN.stream/playlist.m3u8');
    expect(out[1].views).toEqual([
      { label: 'ขาเข้า', hlsUrl: 'https://streaming1.highwaytraffic.go.th/PER-3/PER_3_004_IN.stream/playlist.m3u8' },
      { label: 'ขาออก', hlsUrl: 'https://streaming1.highwaytraffic.go.th/PER-3/PER_3_004_OUT.stream/playlist.m3u8' },
    ]);
  });

  it('ships a valid site list that includes the Sattahip cameras', () => {
    const cams = dohHighwayCameras();
    expect(cams).toHaveLength(DOH_SITES.length);
    expect(new Set(cams.map((c) => c.id)).size).toBe(cams.length);
    expect(cams.filter((c) => c.name.includes('สัตหีบ') || c.id === 'doh-PER-16-014')).toHaveLength(2);
    for (const c of cams) {
      expect(c.location.lat).toBeGreaterThan(12.5);
      expect(c.location.lat).toBeLessThan(15.5);
      expect(c.hlsUrl).toMatch(/^https:\/\/streaming\d\.highwaytraffic\.go\.th\//);
    }
  });
});
