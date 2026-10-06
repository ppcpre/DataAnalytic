/** กล้องโปรดของผู้ใช้ เก็บในเครื่องของผู้ใช้เท่านั้น (localStorage) */
export interface FavoriteCamera {
  id: string;
  /** เก็บชื่อไว้ด้วย เพื่อแสดงรายการได้แม้กล้องหายจากรายชื่อชั่วคราว */
  name: string;
  owner: string;
  savedAt: number;
}

export const MAX_FAVORITES = 50;
const KEY = 'fw.favcams.v1';

function valid(x: unknown): x is FavoriteCamera {
  const f = x as FavoriteCamera;
  return !!f && typeof f.id === 'string' && !!f.id && typeof f.name === 'string' && typeof f.owner === 'string';
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadFavorites(storage: Pick<Storage, 'getItem'> | null = safeStorage()): FavoriteCamera[] {
  try {
    const raw = storage?.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown[]) : [];
    return Array.isArray(list) ? list.filter(valid).slice(0, MAX_FAVORITES) : [];
  } catch {
    return [];
  }
}

/** คืน false เมื่อบันทึกในเครื่องไม่ได้ (เช่น โหมดส่วนตัว) */
export function storeFavorites(list: FavoriteCamera[], storage: Pick<Storage, 'setItem'> | null = safeStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(KEY, JSON.stringify(list.slice(0, MAX_FAVORITES)));
    return true;
  } catch {
    return false;
  }
}

/** เพิ่ม/เอาออก — กล้องที่เพิ่มล่าสุดอยู่บนสุด */
export function toggleFavorite(
  list: FavoriteCamera[],
  cam: { id: string; name: string; owner: string },
  now = Date.now(),
): FavoriteCamera[] {
  if (list.some((f) => f.id === cam.id)) return list.filter((f) => f.id !== cam.id);
  return [{ id: cam.id, name: cam.name, owner: cam.owner, savedAt: now }, ...list].slice(0, MAX_FAVORITES);
}
