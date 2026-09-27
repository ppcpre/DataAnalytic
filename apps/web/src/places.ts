import type { Status } from '@flood-watch/shared';
import { STATUS_ORDER, distanceKm } from './format';

/** จุดที่ผู้ใช้ติดตาม เก็บในเครื่องของผู้ใช้เท่านั้น (localStorage) */
export interface SavedPlace {
  id: string;
  label: string;
  name: string;
  detail: string;
  lat: number;
  lng: number;
}

export const PLACE_LABELS = ['บ้าน', 'ที่ทำงาน', 'โรงเรียน', 'อื่น ๆ'];
export const MAX_PLACES = 5;
export const PLACE_RADIUS_KM = 2;
const KEY = 'fw.places.v1';

function valid(p: unknown): p is SavedPlace {
  const x = p as SavedPlace;
  return (
    !!x &&
    typeof x.id === 'string' &&
    typeof x.label === 'string' &&
    typeof x.name === 'string' &&
    Number.isFinite(x.lat) &&
    Number.isFinite(x.lng)
  );
}

export function loadPlaces(storage: Pick<Storage, 'getItem'> | null = safeStorage()): SavedPlace[] {
  try {
    const raw = storage?.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown[]) : [];
    return Array.isArray(list) ? list.filter(valid).slice(0, MAX_PLACES) : [];
  } catch {
    return [];
  }
}

/** คืนค่า false ถ้าบันทึกไม่ได้ (เช่น โหมดส่วนตัว) */
export function storePlaces(list: SavedPlace[], storage: Pick<Storage, 'setItem'> | null = safeStorage()): boolean {
  try {
    storage?.setItem(KEY, JSON.stringify(list.slice(0, MAX_PLACES)));
    return !!storage;
  } catch {
    return false;
  }
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export interface NearbyInput {
  kind: 'water' | 'rain';
  id: string;
  name: string;
  status: Status;
  text: string;
  location: { lat: number; lng: number };
}

export interface NearbyItem extends NearbyInput {
  distKm: number;
}

export interface AreaSummary {
  items: NearbyItem[];
  /** สถานะที่รุนแรงที่สุดในรัศมี (ไม่มีสถานี = unknown) */
  worst: Status;
  counts: Record<Status, number>;
}

/** สรุปสถานการณ์รอบจุด: เรียงจากรุนแรงไปน้อย แล้วใกล้ไปไกล */
export function summarizeArea(
  loc: { lat: number; lng: number },
  stations: NearbyInput[],
  radiusKm = PLACE_RADIUS_KM,
): AreaSummary {
  const items = stations
    .map((s) => ({ ...s, distKm: distanceKm(loc, s.location) }))
    .filter((s) => s.distKm <= radiusKm)
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.distKm - b.distKm);
  const counts: Record<Status, number> = { normal: 0, watch: 0, warning: 0, critical: 0, unknown: 0 };
  for (const s of items) counts[s.status]++;
  const worst = items.find((s) => s.status !== 'unknown')?.status ?? 'unknown';
  return { items, worst, counts };
}
