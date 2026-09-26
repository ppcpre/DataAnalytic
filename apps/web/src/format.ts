import { PROVINCES, type Status } from '@flood-watch/shared';

export const STATUS_ORDER: Record<Status, number> = {
  critical: 0,
  warning: 1,
  watch: 2,
  normal: 3,
  unknown: 4,
};

export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

const timeFmt = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Bangkok',
});

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return 'ไม่ทราบเวลา';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'ไม่ทราบเวลา' : `${timeFmt.format(d)} น.`;
}

/** อธิบายว่าข้อมูลเก่าแค่ไหน เช่น "15 นาทีที่แล้ว" */
export function formatAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const mins = Math.round((now - new Date(iso).getTime()) / 60000);
  if (Number.isNaN(mins)) return '';
  if (mins < 1) return 'เมื่อสักครู่';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ชั่วโมงที่แล้ว`;
  return `${Math.floor(hrs / 24)} วันที่แล้ว`;
}

export function formatPlace(province: string, district?: string): string {
  const p = PROVINCES[province] ?? '';
  return [district, p].filter(Boolean).join(', ');
}

export function formatNum(n: number | null, digits = 2): string {
  return n === null ? '–' : n.toLocaleString('th-TH', { maximumFractionDigits: digits });
}

/** ระยะทางแบบเส้นตรง (กม.) */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
