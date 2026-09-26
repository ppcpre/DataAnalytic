/**
 * ข้อมูลตัวอย่างสำหรับพัฒนา/ทดสอบหน้าเว็บเท่านั้น — ไม่ใช่ข้อมูลจริง
 * ชื่อสถานีและพิกัดเป็นค่าสมมติ ใช้เมื่อ DATA_MODE=sample
 */
import {
  rainStatus,
  waterLevelStatus,
  type Camera,
  type FloodForecast,
  type FloodHubSeverity,
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

export function sampleWaterLevel(now = new Date()): WaterLevelStation[] {
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

export function sampleKeyStations(now = new Date()): WaterLevelStation[] {
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
