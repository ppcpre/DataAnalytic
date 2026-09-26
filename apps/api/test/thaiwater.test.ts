import { describe, expect, it } from 'vitest';
import { extractRecords, parseKeyStations, parseRain, parseWaterLevel } from '../src/adapters/thaiwater.js';

const station = (id: number, province: string, lat = 13.75, lng = 100.5) => ({
  id,
  tele_station_name: { th: `สถานี ${id}`, en: `Station ${id}` },
  tele_station_lat: lat,
  tele_station_long: lng,
  min_bank: 2,
});

describe('parseWaterLevel', () => {
  const body = {
    result: 'OK',
    data: {
      waterlevel_data: {
        data: [
          {
            waterlevel_datetime: '2026-09-26 14:00',
            waterlevel_msl: '1.9',
            storage_percent: '95',
            station: station(1, '10'),
            geocode: { province_code: '10', amphoe_name: { th: 'พระนคร' } },
            agency: { agency_shortname: { th: 'สนน.' } },
          },
          {
            // นอกพื้นที่ให้บริการ (เชียงใหม่)
            waterlevel_datetime: '2026-09-26 14:00',
            waterlevel_msl: 300,
            storage_percent: 50,
            station: station(2, '50', 18.8, 98.9),
            geocode: { province_code: '50' },
          },
          {
            // ไม่มีพิกัด
            waterlevel_datetime: '2026-09-26 14:00',
            station: { id: 3 },
            geocode: { province_code: '10' },
          },
          {
            // ไม่มี storage_percent → คำนวณจากระดับตลิ่ง
            waterlevel_datetime: '2026-09-26 13:00',
            waterlevel_msl: 2.2,
            station: station(4, '12', 13.86, 100.51),
            geocode: { province_code: '12' },
          },
        ],
      },
    },
  };

  it('keeps only service-area records with coordinates', () => {
    const out = parseWaterLevel(body);
    expect(out.map((s) => s.id)).toEqual(['tw-wl-1', 'tw-wl-4']);
  });

  it('normalises fields and converts Thai local time to UTC', () => {
    const [s] = parseWaterLevel(body);
    expect(s).toMatchObject({
      name: 'สถานี 1',
      levelMsl: 1.9,
      percent: 95,
      status: 'warning',
      agency: 'สนน.',
      location: { lat: 13.75, lng: 100.5, province: '10', district: 'พระนคร' },
      observedAt: '2026-09-26T07:00:00.000Z',
    });
  });

  it('derives percent from bank level when missing', () => {
    const s = parseWaterLevel(body)[1];
    expect(s.percent).toBe(110);
    expect(s.status).toBe('critical');
  });

  it('returns empty list for unexpected payloads', () => {
    expect(parseWaterLevel(null)).toEqual([]);
    expect(parseWaterLevel({ result: 'FAIL' })).toEqual([]);
  });
});

describe('parseRain', () => {
  it('parses rain_24h records', () => {
    const out = parseRain({
      data: [
        {
          rain_24h: '40.5',
          rainfall_datetime: '2026-09-26 07:00',
          station: station(9, '13', 14.02, 100.52),
          geocode: { province_code: '13' },
        },
        { rain_24h: null, rainfall_datetime: '2026-09-26 07:00', station: station(10, '10'), geocode: { province_code: '10' } },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'tw-rain-9', rain24h: 40.5, status: 'warning' });
  });
});

describe('extractRecords', () => {
  it('falls back to the first nested array', () => {
    expect(extractRecords({ data: { foo: { bar: [{ a: 1 }] } } }, [])).toEqual([{ a: 1 }]);
  });
});

describe('parseKeyStations', () => {
  it('picks configured stations anywhere in the country, in configured order', () => {
    const rec = (id: number, code: string, province: string) => ({
      waterlevel_datetime: '2026-09-26 14:00',
      storage_percent: 80,
      station: { ...station(id, province, 15, 100.1), tele_station_oldcode: code },
      geocode: { province_code: province, province_name: { th: 'ชัยนาท' } },
    });
    const out = parseKeyStations({ data: [rec(1, 'C.29A', '14'), rec(2, 'C.13', '18'), rec(3, 'X.1', '18')] }, [
      'C.13',
      'c29a',
    ]);
    expect(out.map((s) => s.code)).toEqual(['C.13', 'C.29A']);
    expect(out[0].location.provinceName).toBe('ชัยนาท');
  });
});
