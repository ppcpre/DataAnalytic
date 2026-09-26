/** จังหวัดในพื้นที่ให้บริการ (รหัสจังหวัดตามกรมการปกครอง) */
export const PROVINCES: Record<string, string> = {
  '10': 'กรุงเทพมหานคร',
  '11': 'สมุทรปราการ',
  '12': 'นนทบุรี',
  '13': 'ปทุมธานี',
  '73': 'นครปฐม',
  '74': 'สมุทรสาคร',
};

export type Status = 'normal' | 'watch' | 'warning' | 'critical' | 'unknown';

export const STATUS_LABEL_TH: Record<Status, string> = {
  normal: 'ปกติ',
  watch: 'เฝ้าระวัง',
  warning: 'เตือนภัย',
  critical: 'วิกฤต',
  unknown: 'ไม่มีข้อมูล',
};

export interface Location {
  lat: number;
  lng: number;
  province: string;
  /** ชื่อจังหวัดจากต้นทาง (ใช้กับสถานีนอกพื้นที่ให้บริการ) */
  provinceName?: string;
  district?: string;
}

export interface WaterLevelStation {
  id: string;
  name: string;
  /** รหัสสถานี เช่น C.29A (ถ้ามี) */
  code?: string;
  location: Location;
  observedAt: string;
  /** ระดับน้ำ (ม.รทก.) */
  levelMsl: number | null;
  /** ระดับตลิ่ง (ม.รทก.) ถ้ามี */
  bankMsl: number | null;
  /** ร้อยละของความจุลำน้ำ (เทียบระดับตลิ่ง) */
  percent: number | null;
  status: Status;
  agency: string;
}

export interface RainStation {
  id: string;
  name: string;
  location: Location;
  observedAt: string;
  /** ฝนสะสม 24 ชม. (มม.) */
  rain24h: number;
  status: Status;
  agency: string;
}

export interface Floodgate {
  id: string;
  name: string;
  location: Location;
  observedAt: string | null;
  /** ระดับน้ำด้านเหนือประตู (ม.รทก.) */
  upstreamMsl: number | null;
  /** ระดับน้ำด้านท้ายประตู (ม.รทก.) */
  downstreamMsl: number | null;
  agency: string;
  /** ลิงก์ไปหน้าข้อมูลต้นทาง */
  sourceUrl?: string;
}

export type FloodHubSeverity = 'EXTREME' | 'SEVERE' | 'ABOVE_NORMAL' | 'NO_FLOODING' | 'UNKNOWN';

export const FLOODHUB_SEVERITY_TH: Record<FloodHubSeverity, string> = {
  EXTREME: 'น้ำท่วมรุนแรงมาก',
  SEVERE: 'น้ำท่วมรุนแรง',
  ABOVE_NORMAL: 'สูงกว่าปกติ',
  NO_FLOODING: 'ไม่คาดว่าจะท่วม',
  UNKNOWN: 'ไม่ทราบ',
};

/** พยากรณ์น้ำล้นตลิ่งจาก Google Flood Hub ต่อหนึ่งจุดวัด */
export interface FloodForecast {
  id: string;
  location: Location;
  severity: FloodHubSeverity;
  status: Status;
  /** แนวโน้ม เช่น RISE / FALL / NO_CHANGE ตามที่ API ส่งมา */
  trend: string | null;
  issuedAt: string | null;
  forecastStart: string | null;
  forecastEnd: string | null;
}

export interface CameraLink {
  id: string;
  name: string;
  description: string;
  url: string;
  /** ใช้ได้เฉพาะพื้นที่ใด (เช่น "กทม.") ถ้าไม่ระบุ = ทุกพื้นที่ */
  area?: string;
}

/** กล้อง CCTV ที่ทราบพิกัด (แสดงเป็นหมุดบนแผนที่ แตะแล้วเปิดดูภาพที่เว็บของหน่วยงาน) */
export interface Camera {
  id: string;
  name: string;
  road?: string;
  location: Location;
  /** หน่วยงานเจ้าของกล้อง เช่น "กทม." */
  owner: string;
  /** ลิงก์ไปดูภาพกล้อง (หน้าของกล้องตัวนี้ หรือหน้ารวมของหน่วยงาน) */
  url: string;
}

/** ผลการค้นหาสถานที่ */
export interface Place {
  id: string;
  name: string;
  /** รายละเอียดประกอบ เช่น เขต/จังหวัด */
  detail: string;
  lat: number;
  lng: number;
  /** ประเภทจาก OSM เช่น road, district */
  kind: string;
}

export interface ApiResponse<T> {
  data: T[];
  source: string;
  /** เวลาที่เซิร์ฟเวอร์ดึงข้อมูลจากต้นทางล่าสุด */
  fetchedAt: string;
  /** true เมื่อเป็นข้อมูลตัวอย่าง (ไม่ใช่ข้อมูลจริง) */
  sample: boolean;
  /** true เมื่อดึงข้อมูลใหม่ไม่สำเร็จและส่งข้อมูลเก่าจาก cache */
  stale: boolean;
}

/**
 * แปลงร้อยละความจุลำน้ำเป็นสถานะ
 * เกณฑ์เบื้องต้น: <70 ปกติ, 70–90 เฝ้าระวัง, 90–100 เตือนภัย, >100 วิกฤต (ล้นตลิ่ง)
 */
export function waterLevelStatus(percent: number | null): Status {
  if (percent === null || Number.isNaN(percent)) return 'unknown';
  if (percent > 100) return 'critical';
  if (percent >= 90) return 'warning';
  if (percent >= 70) return 'watch';
  return 'normal';
}

/**
 * แปลงฝนสะสม 24 ชม. เป็นสถานะ ตามเกณฑ์ปริมาณฝนของกรมอุตุนิยมวิทยา
 * (ฝนหนัก 35.1–90 มม., ฝนหนักมาก > 90 มม.)
 */
export function rainStatus(mm: number | null): Status {
  if (mm === null || Number.isNaN(mm)) return 'unknown';
  if (mm > 90) return 'critical';
  if (mm > 35) return 'warning';
  if (mm > 10) return 'watch';
  return 'normal';
}

export function isServiceProvince(code: string | undefined | null): boolean {
  return !!code && code in PROVINCES;
}
