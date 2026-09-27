/**
 * ข้อมูลตัวอย่างสำหรับพัฒนา/ทดสอบหน้าเว็บเท่านั้น — ไม่ใช่ข้อมูลจริง
 * ชื่อสถานีและพิกัดเป็นค่าสมมติ ใช้เมื่อ DATA_MODE=sample
 */
import { computeTrend, HOUR, type Reading } from '../history.js';
import {
  rainStatus,
  waterLevelStatus,
  type Camera,
  type FloodForecast,
  type FloodHubSeverity,
  type HistoryPoint,
  type Floodgate,
  type RainStation,
  type WaterLevelStation,
} from '@flood-watch/shared';

const points: Array<[number, number, string, string]> = [
  [13.7563, 100.5018, '10', 'พระนคร'],
  [13.8199, 100.5601, '10', 'จตุจักร'],
  [13.7308, 100.5211, '10', 'บางรัก'],
  [13.6904, 100.6120, '10', 'ประเวศ'],
  [13.8621, 100.5144, '12', 'เมืองนนทบุรี'],
  [14.0208, 100.5250, '13', 'เมืองปทุมธานี'],
  [13.5991, 100.5998, '11', 'เมืองสมุทรปราการ'],
  [13.5475, 100.2744, '74', 'เมืองสมุทรสาคร'],
  [13.8199, 100.0621, '73', 'เมืองนครปฐม'],
];

function hoursAgo(now: Date, h: number): string {
  return new Date(now.getTime() - h * 3600_000).toISOString();
}

function sampleWaterLevelRaw(now = new Date()): WaterLevelStation[] {
  const percents = [45, 72, 93, 108, 60, 81, 55, 97, 30];
  return points.map(([lat, lng, province, district], i) => {
    const bankMsl = 2 + (i % 3) * 0.5;
    const percent = percents[i];
    return {
      id: `sample-wl-${i + 1}`,
      name: `สถานีวัดระดับน้ำตัวอย่าง ${i + 1}`,
      location: { lat: lat + 0.01, lng: lng + 0.01, province, district },
      observedAt: hoursAgo(now, (i % 3) * 0.25),
      levelMsl: Math.round(((bankMsl * percent) / 100) * 100) / 100,
      bankMsl,
      percent,
      status: waterLevelStatus(percent),
      agency: 'ข้อมูลตัวอย่าง',
    };
  });
}

export function sampleRain(now = new Date()): RainStation[] {
  const mm = [5, 18.5, 42, 96.2, 0, 12, 37, 3.2, 0.5];
  return points.map(([lat, lng, province, district], i) => ({
    id: `sample-rain-${i + 1}`,
    name: `สถานีวัดฝนตัวอย่าง ${i + 1}`,
    location: { lat: lat - 0.012, lng: lng + 0.015, province, district },
    observedAt: hoursAgo(now, 0.5),
    rain24h: mm[i],
    status: rainStatus(mm[i]),
    agency: 'ข้อมูลตัวอย่าง',
  }));
}

export function sampleFloodgates(now = new Date()): Floodgate[] {
  return points.slice(0, 6).map(([lat, lng, province, district], i) => ({
    id: `sample-fg-${i + 1}`,
    name: `ประตูระบายน้ำตัวอย่าง ${i + 1}`,
    location: { lat: lat + 0.02, lng: lng - 0.01, province, district },
    observedAt: hoursAgo(now, 1),
    upstreamMsl: 1.2 + i * 0.1,
    downstreamMsl: 0.8 + i * 0.05,
    agency: 'ข้อมูลตัวอย่าง',
  }));
}

function sampleKeyStationsRaw(now = new Date()): WaterLevelStation[] {
  const rows: Array<[string, string, number, number, string, number]> = [
    ['C.2', 'สถานีต้นน้ำตัวอย่าง A', 15.70, 100.12, 'นครสวรรค์', 64],
    ['C.13', 'สถานีต้นน้ำตัวอย่าง B', 15.15, 100.18, 'ชัยนาท', 78],
    ['C.29A', 'สถานีต้นน้ำตัวอย่าง C', 14.23, 100.52, 'พระนครศรีอยุธยา', 91],
  ];
  return rows.map(([code, name, lat, lng, provinceName, percent], i) => ({
    id: `sample-key-${i + 1}`,
    name,
    code,
    location: { lat, lng, province: '', provinceName },
    observedAt: hoursAgo(now, 1),
    levelMsl: null,
    bankMsl: null,
    percent,
    status: waterLevelStatus(percent),
    agency: 'ข้อมูลตัวอย่าง',
  }));
}

export function sampleFloodForecasts(now = new Date()): FloodForecast[] {
  const rows: Array<[number, number, FloodHubSeverity, string]> = [
    [14.35, 100.58, 'SEVERE', 'RISE'],
    [14.02, 100.47, 'ABOVE_NORMAL', 'RISE'],
    [13.93, 100.24, 'NO_FLOODING', 'FALL'],
  ];
  const status = { EXTREME: 'critical', SEVERE: 'warning', ABOVE_NORMAL: 'watch', NO_FLOODING: 'normal', UNKNOWN: 'unknown' } as const;
  return rows.map(([lat, lng, severity, trend], i) => ({
    id: `sample-gfh-${i + 1}`,
    location: { lat, lng, province: '' },
    severity,
    status: status[severity],
    trend,
    issuedAt: hoursAgo(now, 3),
    forecastStart: hoursAgo(now, -24),
    forecastEnd: hoursAgo(now, -72),
  }));
}

export function sampleCameras(): Camera[] {
  const rows: Array<[string, string, number, number, string]> = [
    ['กล้องตัวอย่าง 1', 'ถนนตัวอย่าง A', 13.7545, 100.5405, '10'],
    ['กล้องตัวอย่าง 2', 'ถนนตัวอย่าง B', 13.8265, 100.5655, '10'],
    ['กล้องตัวอย่าง 3', 'ถนนตัวอย่าง C', 13.7002, 100.6071, '10'],
    ['กล้องตัวอย่าง 4', 'ถนนตัวอย่าง D', 13.8650, 100.5200, '12'],
  ];
  return rows.map(([name, road, lat, lng, province], i) => ({
    id: `sample-cam-${i + 1}`,
    name,
    road,
    location: { lat, lng, province },
    owner: 'ข้อมูลตัวอย่าง',
    url: 'https://cpudapp.bangkok.go.th/bmatraffic',
  }));
}

// ---------- ข้อมูลย้อนหลังตัวอย่าง ----------

function seedOf(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** เส้นโค้งสมมติที่จบที่ค่าปัจจุบัน: บางสถานีขึ้น บางสถานีลง บางสถานีทรงตัว */
function samplePercentAt(id: string, current: number, hoursAgo: number): number {
  const seed = seedOf(id);
  const slope = [2.2, -1.1, 0.15][seed % 3];
  const phase = seed % 7;
  const wave = (h: number) => Math.sin(h / 2 + phase) * 1.5;
  return Math.max(0, current - slope * hoursAgo + wave(hoursAgo) - wave(0));
}

function sampleReadings(s: WaterLevelStation, hours: number, now: number): Reading[] {
  const out: Reading[] = [];
  const end = new Date(s.observedAt).getTime() || now;
  for (let h = hours; h >= 0; h -= 0.5) {
    const percent = s.percent === null ? null : Math.round(samplePercentAt(s.id, s.percent, h) * 10) / 10;
    out.push({
      stationId: s.id,
      t: end - h * HOUR,
      percent,
      level: percent !== null && s.bankMsl ? Math.round(((s.bankMsl * percent) / 100) * 100) / 100 : null,
    });
  }
  return out;
}

function withSampleTrend(list: WaterLevelStation[], now: number): WaterLevelStation[] {
  return list.map((s) => {
    const readings = sampleReadings(s, 6, now);
    return { ...s, trend: computeTrend(readings[readings.length - 1], readings) };
  });
}

export function sampleWaterLevel(now = new Date()): WaterLevelStation[] {
  return withSampleTrend(sampleWaterLevelRaw(now), now.getTime());
}

export function sampleKeyStations(now = new Date()): WaterLevelStation[] {
  return withSampleTrend(sampleKeyStationsRaw(now), now.getTime());
}

/** ประวัติตัวอย่างของสถานี (ถ้าไม่ใช่สถานีตัวอย่างคืนค่าว่าง) */
export function sampleHistory(stationId: string, hours: number, now = new Date()): HistoryPoint[] {
  const s = [...sampleWaterLevelRaw(now), ...sampleKeyStationsRaw(now)].find((x) => x.id === stationId);
  if (!s) return [];
  return sampleReadings(s, hours, now.getTime()).map((r) => ({
    t: new Date(r.t).toISOString(),
    levelMsl: r.level,
    percent: r.percent,
  }));
}
