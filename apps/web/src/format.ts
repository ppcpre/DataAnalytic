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

const clockFmt = new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });

/** เวลาแบบสั้น เช่น "14:20 น." */
export function formatClock(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${clockFmt.format(d)} น.`;
}

/** ระยะทางแบบอ่านง่าย: "350 ม." หรือ "1.8 กม." */
export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 100) * 10} ม.` : `${km.toLocaleString('th-TH', { maximumFractionDigits: 1 })} กม.`;
}

/** ครอบคำที่ค้นหาด้วย <b> (escape แล้ว) */
export function highlight(text: string, q: string): string {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return escapeHtml(text);
  return `${escapeHtml(text.slice(0, i))}<b>${escapeHtml(text.slice(i, i + q.length))}</b>${escapeHtml(text.slice(i + q.length))}`;
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

export function formatPlace(province: string, district?: string, provinceName?: string): string {
  const p = PROVINCES[province] ?? provinceName ?? '';
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
