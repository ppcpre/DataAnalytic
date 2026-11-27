import type { Camera } from '@flood-watch/shared';
import { cameraViewHtml, hasCameraMedia, playCameraView, type CameraPlayer } from './camera-view';
import { escapeHtml } from './format';
import { icons } from './icons';

/**
 * ดูหลายกล้องพร้อมกัน (สูงสุด 4 ตัว) จากกล้องโปรด — เปิดเป็นหน้าเต็มจอทับแอป
 * แต่ละช่องเล่นแยกกัน (playCameraView) และหยุดทั้งหมดเมื่อปิดหรือสลับไปแอปอื่น เพื่อไม่ให้ดึงภาพสดค้างไว้
 */
export const MULTIVIEW_MAX = 4;
const KEY = 'fw.multiview.v1';

/** กล้องที่เลือกไว้ครั้งก่อน ที่ยังอยู่ในรายการให้เลือก — ไม่มี/ไม่พอ ใช้กล้องโปรดตัวแรก ๆ */
export function initialSelection(available: string[], saved: string[], max = MULTIVIEW_MAX): string[] {
  const keep = saved.filter((id, i) => available.includes(id) && saved.indexOf(id) === i).slice(0, max);
  return keep.length ? keep : available.slice(0, max);
}

/** เลือก/เอาออก — เกินจำนวนสูงสุดไม่เพิ่ม */
export function toggleSelection(selected: string[], id: string, max = MULTIVIEW_MAX): string[] {
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  return selected.length >= max ? selected : [...selected, id];
}

function loadSaved(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function save(ids: string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* โหมดส่วนตัว: ไม่จำการเลือก */
  }
}

let closeCurrent: (() => void) | null = null;

/**
 * เปิดหน้าดูหลายกล้อง
 * @param cams กล้องโปรดตามลำดับ (เฉพาะที่มีภาพจะให้เลือก)
 * @param onOpen เมื่อผู้ใช้กดดูรายละเอียดของกล้อง (หน้าดูหลายกล้องปิดก่อนแล้ว)
 */
export function openMultiview(
  cams: Camera[],
  onOpen: (id: string) => void,
  opts: { title?: string; subtitle?: string; remember?: boolean } = {},
) {
  closeCurrent?.();
  const remember = opts.remember ?? true;
  const choices = cams.filter(hasCameraMedia);
  if (!choices.length) return;
  let selected = initialSelection(
    choices.map((c) => c.id),
    remember ? loadSaved() : [],
  );
  const players = new Map<string, CameraPlayer | null>();
  const opener = document.activeElement as HTMLElement | null;

  const el = document.createElement('div');
  el.className = 'multiview';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'mv-title');
  el.innerHTML = `
    <div class="mv-head">
      <div class="mv-head-text">
        <h2 id="mv-title">${escapeHtml(opts.title ?? 'ดูหลายกล้องพร้อมกัน')}</h2>
        <span class="muted">${escapeHtml(opts.subtitle ?? `เลือกได้สูงสุด ${MULTIVIEW_MAX} กล้องจากรายการโปรด`)}</span>
      </div>
      <button type="button" class="close-btn" data-mv-close aria-label="ปิดหน้าดูหลายกล้อง">${icons.close()}</button>
    </div>
    <div class="mv-chips" role="group" aria-label="เลือกกล้อง"></div>
    <div class="mv-grid"></div>`;
  const chipsEl = el.querySelector<HTMLElement>('.mv-chips')!;
  const grid = el.querySelector<HTMLElement>('.mv-grid')!;
  const byId = new Map(choices.map((c) => [c.id, c]));

  const stopAll = () => {
    players.forEach((p) => p?.stop());
    players.clear();
  };
  const startTile = (id: string, fresh = false) => {
    const tile = grid.querySelector<HTMLElement>(`[data-mv-tile="${CSS.escape(id)}"]`);
    const cam = byId.get(id);
    if (!tile || !cam) return;
    players.get(id)?.stop();
    players.set(id, playCameraView(tile, cam, fresh));
  };
  const renderChips = () => {
    const full = selected.length >= MULTIVIEW_MAX;
    chipsEl.innerHTML = choices
      .map((c) => {
        const on = selected.includes(c.id);
        return `<button type="button" class="chip" data-mv-pick="${escapeHtml(c.id)}" aria-pressed="${on}"${!on && full ? ' disabled' : ''}>${escapeHtml(c.name)}</button>`;
      })
      .join('');
  };
  const renderGrid = () => {
    stopAll();
    grid.dataset.count = String(selected.length);
    grid.innerHTML = selected.length
      ? selected
          .map((id) => {
            const c = byId.get(id)!;
            return `
        <section class="mv-tile" data-mv-tile="${escapeHtml(id)}" aria-label="${escapeHtml(c.name)}">
          <div class="mv-tile-head">
            <span class="mv-tile-name">${escapeHtml(c.name)}</span>
            <button type="button" class="mv-tile-open" data-mv-open="${escapeHtml(id)}">รายละเอียด</button>
          </div>
          ${cameraViewHtml(c)}
        </section>`;
          })
          .join('')
      : '<p class="mv-empty">แตะชื่อกล้องด้านบนเพื่อเลือก</p>';
    selected.forEach((id) => startTile(id));
  };

  const close = () => {
    stopAll();
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('visibilitychange', onVisibility);
    el.remove();
    document.body.classList.remove('mv-open');
    closeCurrent = null;
    opener?.focus?.();
  };
  // ปิดเฉพาะหน้าดูหลายกล้อง ไม่ให้ Escape ไปปิดหน้าต่างรายละเอียดที่อยู่ข้างใต้ด้วย
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return;
    ev.stopPropagation();
    close();
  };
  // ไม่ดึงภาพสดตอนผู้ใช้สลับไปแอป/แท็บอื่น
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') stopAll();
    else selected.forEach((id) => startTile(id, true));
  };
  el.addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-mv-close],[data-mv-pick],[data-mv-open],[data-cam-refresh]');
    if (!t) return;
    if (t.dataset.mvClose !== undefined) return close();
    if (t.dataset.mvPick) {
      selected = toggleSelection(selected, t.dataset.mvPick);
      if (remember) save(selected);
      renderChips();
      renderGrid();
      return;
    }
    if (t.dataset.mvOpen) {
      const id = t.dataset.mvOpen;
      close();
      onOpen(id);
      return;
    }
    const tile = t.closest<HTMLElement>('[data-mv-tile]');
    if (tile?.dataset.mvTile) startTile(tile.dataset.mvTile, true);
  });
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('visibilitychange', onVisibility);
  document.body.appendChild(el);
  document.body.classList.add('mv-open');
  closeCurrent = close;
  renderChips();
  renderGrid();
  el.querySelector<HTMLElement>('[data-mv-close]')?.focus();
}
