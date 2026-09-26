/**
 * ข้อมูลตัวอย่างสำหรับพัฒนา/ทดสอบหน้าเว็บเท่านั้น — ไม่ใช่ข้อมูลจริง
 * ชื่อสถานีและพิกัดเป็นค่าสมมติ ใช้เมื่อ DATA_MODE=sample
 */
import {
  rainStatus,
  waterLevelStatus,
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
