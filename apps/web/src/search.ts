import type { Camera, Place, Status } from '@flood-watch/shared';
import { api } from './api';
import { escapeHtml, highlight } from './format';
import { icons } from './icons';

export interface SearchStation {
  kind: 'water' | 'rain';
  id: string;
  name: string;
  status: Status;
  detail: string;
  place: string;
}

interface SearchContext {
  getStations: () => SearchStation[];
  getCameras: () => Camera[];
  openEntity: (kind: 'water' | 'rain' | 'camera', id: string) => void;
  goToPlace: (lat: number, lng: number, name: string) => void;
  locate: () => void;
}

type Filter = 'all' | 'place' | 'camera' | 'station';
const MAX_LOCAL = 5;

export function initSearch(ctx: SearchContext) {
  const input = document.getElementById('search-input') as HTMLInputElement;
  const panel = document.getElementById('search-panel')!;
  const results = document.getElementById('search-results')!;
  const clearBtn = document.getElementById('search-clear')!;
  const backBtn = document.getElementById('search-back')!;

  let filter: Filter = 'all';
  let places: Place[] = [];
  let placeState: 'idle' | 'loading' | 'error' = 'idle';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | null = null;

  const open = () => {
    panel.hidden = false;
    document.body.classList.add('searching');
    render();
  };
  const close = () => {
    panel.hidden = true;
    document.body.classList.remove('searching');
    input.blur();
  };

  function render() {
    const q = input.value.trim();
    clearBtn.hidden = !q;
    const ql = q.toLowerCase();
    const parts: string[] = [];

    parts.push(`
      <button type="button" class="result result-me" data-action="locate">
        <span class="result-icon">${icons.locate(20)}</span>
        <span class="result-title">ใช้ตำแหน่งปัจจุบันของฉัน</span>
      </button>`);

    if (!q) {
      parts.push('<p class="search-note">พิมพ์ชื่อสถานที่ ถนน เขต ชื่อกล้อง หรือชื่อสถานี</p>');
      results.innerHTML = parts.join('');
      return;
    }

    if (filter === 'all' || filter === 'place') {
      parts.push('<div class="result-group">สถานที่</div>');
      if (q.length < 2) parts.push('<p class="search-note">พิมพ์อย่างน้อย 2 ตัวอักษร</p>');
      else if (placeState === 'loading' && !places.length) parts.push('<p class="search-note">กำลังค้นหา…</p>');
      else if (placeState === 'error')
        parts.push(`<p class="search-note">${navigator.onLine ? 'ค้นหาสถานที่ไม่สำเร็จ' : 'ค้นหาสถานที่ไม่ได้ขณะออฟไลน์'}</p>`);
      else if (!places.length) parts.push('<p class="search-note">ไม่พบสถานที่</p>');
      else
        parts.push(
          ...places.map(
            (p, i) => `
            <button type="button" class="result" data-action="place" data-index="${i}">
              <span class="result-icon">${p.kind === 'primary' || p.kind === 'secondary' || p.kind === 'residential' ? icons.road() : icons.pin()}</span>
              <span class="result-text"><span class="result-title">${highlight(p.name, q)}</span><span class="result-sub">${escapeHtml(p.detail)}</span></span>
            </button>`,
          ),
        );
    }

    if (filter === 'all' || filter === 'camera') {
      const cams = ctx
        .getCameras()
        .filter((c) => `${c.name} ${c.road ?? ''}`.toLowerCase().includes(ql))
        .slice(0, filter === 'camera' ? 50 : MAX_LOCAL);
      if (cams.length || filter === 'camera') {
        parts.push('<div class="result-group">กล้อง CCTV</div>');
        if (!cams.length) parts.push('<p class="search-note">ไม่พบกล้อง</p>');
        parts.push(
          ...cams.map(
            (c) => `
            <button type="button" class="result" data-action="camera" data-id="${escapeHtml(c.id)}">
              <span class="result-icon" style="background:var(--camera);color:#fff">${icons.camera(20)}</span>
              <span class="result-text"><span class="result-title">${highlight(c.name, q)}</span><span class="result-sub">กล้อง ${escapeHtml(c.owner)}${c.road ? ` · ${escapeHtml(c.road)}` : ''}</span></span>
            </button>`,
          ),
        );
      }
    }

    if (filter === 'all' || filter === 'station') {
      const stations = ctx
        .getStations()
        .filter((s) => `${s.name} ${s.place}`.toLowerCase().includes(ql))
        .slice(0, filter === 'station' ? 50 : MAX_LOCAL);
      if (stations.length || filter === 'station') {
        parts.push('<div class="result-group">สถานีวัดน้ำและฝน</div>');
        if (!stations.length) parts.push('<p class="search-note">ไม่พบสถานี</p>');
        parts.push(
          ...stations.map(
            (s) => `
            <button type="button" class="result" data-action="${s.kind}" data-id="${escapeHtml(s.id)}">
              <span class="result-icon round st-${s.status}" style="color:#fff;font-weight:700">${s.kind === 'water' ? 'น' : 'ฝ'}</span>
              <span class="result-text"><span class="result-title">${highlight(s.name, q)}</span><span class="result-sub ink-${s.status}">${escapeHtml(s.detail)}</span></span>
            </button>`,
          ),
        );
      }
    }
    results.innerHTML = parts.join('');
  }

  async function fetchPlaces(q: string) {
    controller?.abort();
    if (q.length < 2) {
      places = [];
      placeState = 'idle';
      render();
      return;
    }
    controller = new AbortController();
    placeState = 'loading';
    render();
    try {
      places = (await api.geocode(q, controller.signal)).data;
      placeState = 'idle';
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      places = [];
      placeState = 'error';
    }
    render();
  }

  input.addEventListener('focus', open);
  input.addEventListener('input', () => {
    if (panel.hidden) open();
    render();
    clearTimeout(timer);
    const q = input.value.trim();
    timer = setTimeout(() => void fetchPlaces(q), 300);
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      close();
    }
    if (ev.key === 'Enter') {
      const first = results.querySelector<HTMLButtonElement>('.result:not(.result-me)');
      first?.click();
    }
  });
  clearBtn.addEventListener('click', () => {
    input.value = '';
    places = [];
    input.focus();
    render();
  });
  backBtn.addEventListener('click', close);

  panel.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((b) =>
    b.addEventListener('click', () => {
      filter = b.dataset.filter as Filter;
      panel
        .querySelectorAll<HTMLButtonElement>('[data-filter]')
        .forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      render();
    }),
  );

  results.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!b) return;
    const action = b.dataset.action!;
    close();
    if (action === 'locate') ctx.locate();
    else if (action === 'place') {
      const p = places[Number(b.dataset.index)];
      if (p) ctx.goToPlace(p.lat, p.lng, p.name);
    } else ctx.openEntity(action as 'water' | 'rain' | 'camera', b.dataset.id!);
  });

  // คลิกนอกช่องค้นหา (เดสก์ท็อป/แท็บเล็ต) = ปิด
  document.addEventListener('pointerdown', (ev) => {
    if (panel.hidden) return;
    const t = ev.target as Node;
    if (panel.contains(t) || document.querySelector('.topbar')!.contains(t)) return;
    close();
  });

  // กด "/" เพื่อค้นหา
  document.addEventListener('keydown', (ev) => {
    const tag = (ev.target as HTMLElement).tagName;
    if (ev.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
      ev.preventDefault();
      input.focus();
    }
  });
}
