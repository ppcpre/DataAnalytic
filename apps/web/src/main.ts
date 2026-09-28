import 'leaflet/dist/leaflet.css';
import './style.css';
import L from 'leaflet';
import { addOsmRaster, vectorMapSupported } from './osm';
import { cameraViewHtml, hasCameraMedia, isLiveCamera, startCameraView, stopCameraView } from './camera-view';
import { registerSW } from 'virtual:pwa-register';
import {
  FLOODHUB_SEVERITY_TH,
  STATUS_LABEL_TH,
  type ApiResponse,
  type Camera,
  type CameraLink,
  type FloodForecast,
  type Floodgate,
  type RainStation,
  type Status,
  type WaterLevelStation,
} from '@flood-watch/shared';
import { api } from './api';
import { icons } from './icons';
import {
  STATUS_ORDER,
  distanceKm,
  escapeHtml,
  formatAgo,
  formatClock,
  formatDistance,
  formatNum,
  formatPlace,
  formatTime,
} from './format';
import { initSearch } from './search';
import { directThaiWater, thaiWaterHistory } from './direct';
import { waterDiagram } from './water-diagram';
import { renderHistoryChart, trendText } from './chart';
import {
  MAX_PLACES,
  PLACE_LABELS,
  PLACE_RADIUS_KM,
  loadPlaces,
  storePlaces,
  summarizeArea,
  type NearbyInput,
  type SavedPlace,
} from './places';

registerSW({ immediate: true });

/** ข้อมูลที่เก่ากว่านี้จะแสดงคำเตือน */
const STALE_AFTER_MIN = 45;
const AUTO_REFRESH_MS = 5 * 60 * 1000;
const RISK_PAGE = 5;
const NEARBY_KM = 1;
const BKK_CENTER: L.LatLngExpression = [13.76, 100.54];
const DESKTOP = window.matchMedia('(min-width: 1024px)');

// ---------- ไอคอนใน HTML ----------
document.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
  const make = icons[el.dataset.icon as keyof typeof icons];
  if (make) el.innerHTML = make();
});
document.getElementById('refresh')!.innerHTML = icons.refresh();
document.getElementById('locate')!.innerHTML = icons.locate();
document.getElementById('legend-toggle')!.innerHTML = icons.layers();
document.getElementById('search-back')!.innerHTML = icons.back();
document.getElementById('search-clear')!.innerHTML = icons.close(14);

// ---------- แผนที่ ----------
const map = L.map('map', { zoomControl: false }).setView(BKK_CENTER, 11);
L.control.zoom({ position: 'bottomright' }).addTo(map);
// โหลดแผนที่ฐานแยกไฟล์ เพื่อให้หมุดข้อมูลขึ้นก่อนบนเน็ตช้า
// ถ้าเครื่องไม่รองรับ หรือโหลดไฟล์ไม่ขึ้น (เช่น iPad รุ่นเก่า) ใช้ OpenStreetMap แทน
if (vectorMapSupported()) {
  import('./basemap')
    .then((m) => m.addBasemap(map, addOsmRaster))
    .catch((err) => {
      console.warn('โหลดแผนที่ vector ไม่สำเร็จ — ใช้แผนที่ OpenStreetMap แทน', err);
      addOsmRaster(map);
    });
} else addOsmRaster(map);

export type LayerKey = 'water' | 'rain' | 'camera' | 'gate' | 'forecast' | 'place';
const layers: Record<LayerKey, L.LayerGroup> = {
  water: L.layerGroup().addTo(map),
  rain: L.layerGroup().addTo(map),
  camera: L.layerGroup().addTo(map),
  gate: L.layerGroup().addTo(map),
  forecast: L.layerGroup().addTo(map),
  place: L.layerGroup().addTo(map),
};
const LETTER: Record<Exclude<LayerKey, 'camera' | 'place'>, string> = { water: 'น', rain: 'ฝ', gate: 'ป', forecast: 'ส' };

function pinHtml(kind: LayerKey, status: Status, selected = false, extra = ''): string {
  const cls = `pin pin-${kind} pin-${status} ${kind === 'camera' ? '' : `st-${status}`}${selected ? ' is-selected' : ''}${extra ? ` ${extra}` : ''}`;
  const inner = kind === 'camera' ? icons.camera(16, 2.2) : kind === 'place' ? icons.star(15) : LETTER[kind];
  return `<span class="${cls}" aria-hidden="true">${inner}</span>`;
}

function pinIcon(kind: LayerKey, status: Status, selected = false, extra = ''): L.DivIcon {
  const size = kind === 'gate' ? 28 : 30;
  return L.divIcon({
    className: '',
    html: pinHtml(kind, status, selected, extra),
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const TREND_TH: Record<string, string> = {
  RISE: 'มีแนวโน้มสูงขึ้น',
  FALL: 'มีแนวโน้มลดลง',
  NO_CHANGE: 'ทรงตัว',
  REMAIN: 'ทรงตัว',
};

// ---------- สถานะแอป ----------
interface State {
  water: ApiResponse<WaterLevelStation> | null;
  rain: ApiResponse<RainStation> | null;
  gates: ApiResponse<Floodgate> | null;
  keyStations: ApiResponse<WaterLevelStation> | null;
  forecast: ApiResponse<FloodForecast> | null;
  cameras: ApiResponse<Camera> | null;
  errors: string[];
  userPos: { lat: number; lng: number } | null;
  sort: 'risk' | 'near';
  showAllRisks: boolean;
  selected: { kind: LayerKey; id: string } | null;
  places: SavedPlace[];
  /** สถานที่จากการค้นหา/ตำแหน่งปัจจุบันที่ยังไม่ได้บันทึก */
  tempPlace: SavedPlace | null;
}
const state: State = {
  water: null,
  rain: null,
  gates: null,
  keyStations: null,
  forecast: null,
  cameras: null,
  errors: [],
  userPos: null,
  sort: 'risk',
  showAllRisks: false,
  selected: null,
  places: loadPlaces(),
  tempPlace: null,
};

type Entity =
  | { kind: 'water'; item: WaterLevelStation }
  | { kind: 'rain'; item: RainStation }
  | { kind: 'gate'; item: Floodgate }
  | { kind: 'forecast'; item: FloodForecast }
  | { kind: 'camera'; item: Camera }
  | { kind: 'place'; item: PlaceItem };

interface PlaceItem extends SavedPlace {
  location: { lat: number; lng: number; province: string };
  saved: boolean;
}

function toPlaceItem(p: SavedPlace, saved: boolean): PlaceItem {
  return { ...p, location: { lat: p.lat, lng: p.lng, province: '' }, saved };
}

function findEntity(kind: LayerKey, id: string): Entity | null {
  if (kind === 'place') {
    const saved = state.places.find((p) => p.id === id);
    if (saved) return { kind, item: toPlaceItem(saved, true) };
    return state.tempPlace?.id === id ? { kind, item: toPlaceItem(state.tempPlace, false) } : null;
  }
  const lists: Record<Exclude<LayerKey, 'place'>, { id: string }[] | undefined> = {
    water: state.water?.data,
    rain: state.rain?.data,
    gate: state.gates?.data,
    forecast: state.forecast?.data,
    camera: state.cameras?.data,
  };
  const item = lists[kind]?.find((x) => x.id === id);
  return item ? ({ kind, item } as Entity) : null;
}

const markers = new Map<string, { marker: L.Marker; kind: LayerKey; status: Status; extra: string }>();

// ---------- มุมมอง (responsive) ----------
type View = 'map' | 'watch' | 'cctv' | 'info';
function showView(view: View) {
  document.body.dataset.view = view;
  const panel = view === 'map' ? 'watch' : view;
  document.body.dataset.panel = panel;
  document.querySelectorAll<HTMLButtonElement>('.tabbar button').forEach((b) => {
    if (b.dataset.view === view) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  document
    .querySelectorAll<HTMLButtonElement>('.seg [data-panel]')
    .forEach((b) => b.setAttribute('aria-selected', String(b.dataset.panel === panel)));
  requestAnimationFrame(() => map.invalidateSize());
}

/** บนมือถือ/แท็บเล็ตต้องสลับไปหน้าแผนที่ก่อนเลื่อนแผนที่ บนเดสก์ท็อปแผนที่แสดงตลอด */
function ensureMapVisible() {
  if (!DESKTOP.matches && document.body.dataset.view !== 'map') showView('map');
}

document.querySelectorAll<HTMLButtonElement>('.tabbar button').forEach((b) =>
  b.addEventListener('click', () => showView(b.dataset.view as View)),
);
document.querySelectorAll<HTMLButtonElement>('.seg [data-panel]').forEach((b) =>
  b.addEventListener('click', () => showView(b.dataset.panel as View)),
);

// ---------- Sheet รายละเอียด ----------
const sheetEl = document.getElementById('sheet')!;

function statusBadge(status: Status, extra = ''): string {
  return `<span class="badge st-${status}">${STATUS_LABEL_TH[status]}${extra}</span>`;
}

function distanceText(loc: { lat: number; lng: number }): string {
  return state.userPos ? ` · ห่าง ${formatDistance(distanceKm(state.userPos, loc))}` : '';
}

function sheetHead(kindHtml: string, title: string, sub: string, lead = ''): string {
  return `
    <div class="sheet-handle"></div>
    <div class="sheet-head">
      ${lead}
      <div class="sheet-head-text">
        <div class="sheet-kind">${kindHtml}</div>
        <div class="sheet-title">${escapeHtml(title)}</div>
        <div class="sheet-sub">${sub}</div>
      </div>
      <button type="button" class="close-btn" data-close aria-label="ปิด">${icons.close()}</button>
    </div>`;
}

function tiles(items: Array<[string, string]>): string {
  return `<div class="tiles">${items
    .map(([k, v]) => `<div class="tile"><span>${escapeHtml(k)}</span><span>${escapeHtml(v)}</span></div>`)
    .join('')}</div>`;
}

function nearestCamera(loc: { lat: number; lng: number }, maxKm = 2): Camera | null {
  let best: Camera | null = null;
  let bestD = maxKm;
  for (const c of state.cameras?.data ?? []) {
    const d = distanceKm(loc, c.location);
    if (d <= bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/** แสดงภาพจากกล้องที่ใกล้ที่สุดในหน้ารายละเอียดของสถานี/ประตูน้ำ/สถานที่ เมื่ออยู่ในรัศมีนี้ */
const NEAR_CAMERA_KM = 5;

function cameraButton(loc: { lat: number; lng: number }): string {
  const cam = nearestCamera(loc, NEAR_CAMERA_KM);
  if (cam) {
    return `
    <div class="near-cam">
      <span class="nearby-title">กล้อง CCTV ใกล้จุดนี้ · ห่าง ${formatDistance(distanceKm(loc, cam.location))}</span>
      ${cameraViewHtml(cam)}
      <button type="button" class="btn-primary" data-open="camera:${escapeHtml(cam.id)}">${icons.camera(18)}${escapeHtml(cam.name)}</button>
    </div>`;
  }
  const any = nearestCamera(loc, Infinity);
  const far = any ? ` (กล้องที่ใกล้ที่สุดห่าง ${formatDistance(distanceKm(loc, any.location))})` : '';
  return `
    <span class="btn-caption">ไม่มีกล้อง CCTV ในรัศมี ${NEAR_CAMERA_KM} กม.${far}</span>
    ${
      any
        ? `<button type="button" class="btn-primary" data-open="camera:${escapeHtml(any.id)}">${icons.camera(18)}ดูกล้องที่ใกล้ที่สุด</button>`
        : `<button type="button" class="btn-primary" data-goto="cctv">${icons.camera(18)}ดูกล้อง CCTV</button>`
    }`;
}

function waterSheet(s: WaterLevelStation): string {
  const pct = s.percent;
  const width = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  return `
    ${sheetHead(
      `${statusBadge(s.status, s.status === 'critical' ? ' · ล้นตลิ่ง' : '')}<span>สถานีวัดระดับน้ำ</span>`,
      s.name,
      escapeHtml(formatPlace(s.location.province, s.location.district, s.location.provinceName)) + distanceText(s.location),
    )}
    <div class="meter">
      <div class="meter-top"><span>ระดับน้ำเทียบตลิ่ง</span><span class="meter-value ink-${s.status}">${formatNum(pct, 1)}%</span></div>
      <div class="bar"><span class="st-${s.status}" style="width:${width}%"></span></div>
      <div class="meter-scale"><span>0%</span><span>70% เฝ้าระวัง</span><span>ตลิ่ง 100%</span></div>
    </div>
    ${s.trend ? `<div class="trend">${escapeHtml(trendText(s.trend))}</div>` : ''}
    ${waterDiagram(s)}
    <div class="chart-block">
      <div class="chart-title"><span>ระดับน้ำเทียบตลิ่ง 24 ชม.</span></div>
      <div class="chart-host" data-history="${escapeHtml(s.id)}"><p class="chart-loading">กำลังโหลดข้อมูลย้อนหลัง…</p></div>
    </div>
    ${tiles([
      ['ระดับน้ำ', `${formatNum(s.levelMsl)} ม.รทก.`],
      ['ตลิ่ง', `${formatNum(s.bankMsl)} ม.รทก.`],
      ['วัดเมื่อ', formatAgo(s.observedAt) || '–'],
    ])}
    <div class="sheet-sub">${escapeHtml(s.agency)} · ${formatTime(s.observedAt)}</div>
    ${cameraButton(s.location)}`;
}

function rainSheet(s: RainStation): string {
  return `
    ${sheetHead(
      `${statusBadge(s.status)}<span>สถานีวัดฝน</span>`,
      s.name,
      escapeHtml(formatPlace(s.location.province, s.location.district, s.location.provinceName)) + distanceText(s.location),
    )}
    <div class="meter">
      <div class="meter-top"><span>ฝนสะสม 24 ชม.</span><span class="meter-value ink-${s.status}">${formatNum(s.rain24h, 1)} มม.</span></div>
    </div>
    ${tiles([
      ['ระดับ', STATUS_LABEL_TH[s.status]],
      ['วัดเมื่อ', formatAgo(s.observedAt) || '–'],
      ['หน่วยงาน', s.agency],
    ])}
    ${cameraButton(s.location)}`;
}

function gateSheet(g: Floodgate): string {
  const diff = g.upstreamMsl !== null && g.downstreamMsl !== null ? `${formatNum(g.upstreamMsl - g.downstreamMsl)} ม.` : '–';
  return `
    ${sheetHead(
      '<span>ประตูระบายน้ำ</span>',
      g.name,
      escapeHtml(formatPlace(g.location.province, g.location.district, g.location.provinceName)) + distanceText(g.location),
    )}
    ${tiles([
      ['เหนือประตู', `${formatNum(g.upstreamMsl)} ม.รทก.`],
      ['ท้ายประตู', `${formatNum(g.downstreamMsl)} ม.รทก.`],
      ['ผลต่าง', diff],
    ])}
    <div class="sheet-sub">${escapeHtml(g.agency)} · ${formatTime(g.observedAt)}</div>
    ${cameraButton(g.location)}`;
}

function forecastSheet(f: FloodForecast): string {
  const range = f.forecastStart || f.forecastEnd ? `${formatTime(f.forecastStart)} – ${formatTime(f.forecastEnd)}` : '–';
  return `
    ${sheetHead(`${statusBadge(f.status)}<span>พยากรณ์ Google Flood Hub</span>`, 'พยากรณ์น้ำล้นตลิ่ง', `ช่วงพยากรณ์ ${range}`)}
    ${tiles([
      ['ระดับที่คาด', FLOODHUB_SEVERITY_TH[f.severity]],
      ['แนวโน้ม', f.trend ? (TREND_TH[f.trend] ?? f.trend) : '–'],
      ['ออกพยากรณ์', formatAgo(f.issuedAt) || '–'],
    ])}
    <a class="btn-primary" href="https://sites.research.google/floods" target="_blank" rel="noopener noreferrer">ดูใน Google Flood Hub ${icons.external()}</a>`;
}

function cameraSheet(c: Camera): string {
  const around = [
    ...(state.water?.data ?? []).map((s) => ({
      kind: 'water' as const,
      id: s.id,
      status: s.status,
      text: `${s.name} ${formatNum(s.percent, 0)}% · ${STATUS_LABEL_TH[s.status]}`,
      d: distanceKm(c.location, s.location),
    })),
    ...(state.rain?.data ?? []).map((s) => ({
      kind: 'rain' as const,
      id: s.id,
      status: s.status,
      text: `ฝน 24 ชม. ${formatNum(s.rain24h, 1)} มม. · ${STATUS_LABEL_TH[s.status]}`,
      d: distanceKm(c.location, s.location),
    })),
  ]
    .filter((x) => x.d <= NEARBY_KM)
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.d - b.d)
    .slice(0, 3);

  const nearby = around.length
    ? around
        .map(
          (x) => `
          <button type="button" class="nearby-row soft-${x.status}" data-open="${x.kind}:${escapeHtml(x.id)}">
            <span class="mini-pin st-${x.status}">${LETTER[x.kind]}</span>
            <span><strong>${escapeHtml(x.text)}</strong><small>ห่างกล้อง ${formatDistance(x.d)}</small></span>
          </button>`,
        )
        .join('')
    : `<div class="card-empty">ไม่มีสถานีวัดในรัศมี ${NEARBY_KM} กม.</div>`;

  return `
    ${sheetHead(
      `<span style="color:var(--brand);font-weight:600">${c.kind === 'water' ? 'กล้อง/จุดวัดระดับน้ำ' : 'กล้อง CCTV'} · ${escapeHtml(c.owner)}</span>`,
      c.name,
      escapeHtml(c.road ?? '') + distanceText(c.location),
      `<span class="cam-icon">${icons.camera(24)}</span>`,
    )}
    ${cameraViewHtml(c)}
    <div class="nearby">
      <span class="nearby-title">รอบกล้องนี้ (รัศมี ${NEARBY_KM} กม.)</span>
      ${nearby}
    </div>
    <a class="btn-primary" href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer">${
      hasCameraMedia(c) ? 'เปิดดูในเว็บต้นทาง' : 'ดูภาพกล้องนี้'
    } ${icons.external()}</a>
    <span class="btn-caption">${c.via ? `เปิดใน ${escapeHtml(c.via)} · กล้องของ ${escapeHtml(c.owner)}` : `เปิดในเว็บของ ${escapeHtml(c.owner)}`}</span>`;
}

function nearbyInputs(): NearbyInput[] {
  return [
    ...(state.water?.data ?? []).map((s) => ({
      kind: 'water' as const,
      id: s.id,
      name: s.name,
      status: s.status,
      text: `${s.name} ${formatNum(s.percent, 0)}%${s.trend && s.trend.direction !== 'steady' ? ` ${trendText(s.trend, true)}` : ''} · ${
        STATUS_LABEL_TH[s.status]
      }`,
      location: s.location,
    })),
    ...(state.rain?.data ?? []).map((s) => ({
      kind: 'rain' as const,
      id: s.id,
      name: s.name,
      status: s.status,
      text: `ฝน 24 ชม. ${formatNum(s.rain24h, 1)} มม. · ${STATUS_LABEL_TH[s.status]}`,
      location: s.location,
    })),
  ];
}

function areaLine(counts: Record<Status, number>): string {
  const parts = (['critical', 'warning', 'watch'] as Status[])
    .filter((s) => counts[s])
    .map((s) => `${STATUS_LABEL_TH[s]} ${counts[s]}`);
  return parts.length ? parts.join(' · ') : 'ไม่มีจุดเสี่ยง';
}

function placeSheet(p: PlaceItem): string {
  const area = summarizeArea(p.location, nearbyInputs());
  const rows = area.items.length
    ? area.items
        .slice(0, 4)
        .map(
          (x) => `
          <button type="button" class="nearby-row soft-${x.status}" data-open="${x.kind}:${escapeHtml(x.id)}">
            <span class="mini-pin st-${x.status}">${LETTER[x.kind]}</span>
            <span><strong>${escapeHtml(x.text)}</strong><small>ห่าง ${formatDistance(x.distKm)}</small></span>
          </button>`,
        )
        .join('')
    : `<div class="card-empty">ไม่มีสถานีวัดในรัศมี ${PLACE_RADIUS_KM} กม.</div>`;

  const saveBlock = p.saved
    ? `<button type="button" class="btn-secondary" data-remove-place="${escapeHtml(p.id)}">${icons.close(16)}เลิกติดตามจุดนี้</button>`
    : state.places.length >= MAX_PLACES
      ? `<p class="muted">ติดตามได้สูงสุด ${MAX_PLACES} จุด — ลบจุดเดิมในหน้าเฝ้าระวังก่อน</p>`
      : `<div class="save-block">
          <span class="nearby-title">บันทึกเป็นจุดที่ติดตาม</span>
          <div class="label-chips" role="group" aria-label="ชื่อจุด">
            ${PLACE_LABELS.map(
              (l, i) =>
                `<button type="button" class="chip" data-label="${escapeHtml(l)}" aria-pressed="${i === 0}">${escapeHtml(l)}</button>`,
            ).join('')}
          </div>
          <button type="button" class="btn-primary" data-save-place="${escapeHtml(p.id)}">${icons.star(18)}บันทึกจุดนี้</button>
        </div>`;

  return `
    ${sheetHead(
      `${p.saved ? `<span class="badge-soft soft-unknown">${escapeHtml(p.label)}</span>` : ''}<span>${
        p.saved ? 'จุดที่ติดตาม' : 'สถานที่'
      }</span>`,
      p.name,
      escapeHtml(p.detail) + distanceText(p.location),
      `<span class="cam-icon">${icons.star(24)}</span>`,
    )}
    <div class="nearby">
      <span class="nearby-title">รอบจุดนี้ (รัศมี ${PLACE_RADIUS_KM} กม.) · ${escapeHtml(areaLine(area.counts))}</span>
      ${rows}
    </div>
    ${p.saved ? `${cameraButton(p.location)}${saveBlock}` : `${saveBlock}${cameraButton(p.location)}`}`;
}

function renderSheet(e: Entity): string {
  switch (e.kind) {
    case 'water':
      return waterSheet(e.item);
    case 'rain':
      return rainSheet(e.item);
    case 'gate':
      return gateSheet(e.item);
    case 'forecast':
      return forecastSheet(e.item);
    case 'camera':
      return cameraSheet(e.item);
    case 'place':
      return placeSheet(e.item);
  }
}

function setSelectedMarker(sel: State['selected']) {
  const prev = state.selected;
  state.selected = sel;
  for (const key of [prev, sel]) {
    if (!key) continue;
    const m = markers.get(`${key.kind}:${key.id}`);
    if (m) m.marker.setIcon(pinIcon(m.kind, m.status, sel?.kind === key.kind && sel.id === key.id, m.extra));
  }
}

export /** เริ่มแสดงภาพกล้อง (ตัวที่เลือก หรือกล้องใกล้จุดที่เปิดอยู่) ในหน้ารายละเอียด */
function startSheetCamera(fresh = false) {
  const id = sheetEl.querySelector<HTMLElement>('[data-cam-view]')?.dataset.camId;
  const cam = id ? state.cameras?.data.find((c) => c.id === id) : undefined;
  if (cam) startCameraView(sheetEl, cam, fresh);
  else stopCameraView();
}

function openEntity(kind: LayerKey, id: string, pan = true) {
  const e = findEntity(kind, id);
  if (!e) return;
  ensureMapVisible();
  sheetEl.innerHTML = renderSheet(e);
  sheetEl.hidden = false;
  void loadHistoryChart();
  startSheetCamera();
  document.body.classList.add('sheet-open');
  setSelectedMarker({ kind, id });
  // จัดให้จุดที่เลือกอยู่กลางพื้นที่แผนที่ที่ไม่ถูกแผ่นรายละเอียดบัง
  const loc = e.item.location;
  map.setView([loc.lat, loc.lng], pan ? Math.max(map.getZoom(), 14) : map.getZoom(), { animate: false });
  requestAnimationFrame(() => centerInVisibleArea(loc));
  renderRiskList();
}

const historyCache = new Map<string, { at: number; data: Awaited<ReturnType<typeof api.history>>['data'] }>();
async function loadHistoryChart() {
  const host = sheetEl.querySelector<HTMLElement>('[data-history]');
  if (!host) return;
  const id = host.dataset.history!;
  try {
    let entry = historyCache.get(id);
    if (!entry || Date.now() - entry.at > 2 * 60_000) {
      let data = await api.history(id, 24).then((r) => r.data, () => []);
      // API ยังเก็บประวัติไม่พอ (หรือดึงไม่ได้) → ใช้กราฟย้อนหลังของ ThaiWater โดยตรง
      if (data.filter((p) => p.percent !== null).length < 2) data = await thaiWaterHistory(id, 24).catch(() => data);
      entry = { at: Date.now(), data };
      historyCache.set(id, entry);
    }
    // ผู้ใช้อาจเปิดจุดอื่นระหว่างรอ
    if (!host.isConnected) return;
    renderHistoryChart(host, entry.data, 24);
  } catch {
    if (host.isConnected) host.innerHTML = '<p class="chart-empty">โหลดข้อมูลย้อนหลังไม่สำเร็จ</p>';
  }
}

/**
 * เลื่อนแผนที่ให้จุดที่เลือกอยู่กลางพื้นที่ที่มองเห็นจริง
 * (ไม่ถูกแถบค้นหา ปุ่มชั้นข้อมูล แถบแจ้งเตือน หรือแผ่นรายละเอียดบัง)
 */
function centerInVisibleArea(loc: { lat: number; lng: number }) {
  const mapRect = map.getContainer().getBoundingClientRect();
  const sheetRect = sheetEl.getBoundingClientRect();
  let top = mapRect.top;
  let bottom = mapRect.bottom;
  let right = mapRect.right;
  for (const sel of ['.map-top', '#banners']) {
    const r = document.querySelector(sel)?.getBoundingClientRect();
    if (r && r.height && r.bottom > top && r.top < mapRect.top + mapRect.height / 2) top = r.bottom;
  }
  if (window.innerWidth < 600) {
    bottom = Math.min(bottom, sheetRect.top);
    // ถ้าพื้นที่เหลือน้อยเกินไป ใช้ช่องใต้แถบค้นหาอย่างเดียว
    if (bottom - top < 80) top = mapRect.top + 72;
  } else {
    right = Math.min(right, sheetRect.left);
  }
  const target = L.point((mapRect.left + right) / 2 - mapRect.left, (top + bottom) / 2 - mapRect.top);
  const current = map.latLngToContainerPoint([loc.lat, loc.lng]);
  map.panBy(current.subtract(target), { animate: true });
}

function closeSheet() {
  if (state.tempPlace) {
    state.tempPlace = null;
    renderPlaces();
  }
  sheetEl.hidden = true;
  // หยุดดึงภาพจากกล้อง (ภาพสดจะโหลดต่อเนื่องถ้ายังอยู่ในหน้า)
  stopCameraView();
  sheetEl.innerHTML = '';
  document.body.classList.remove('sheet-open');
  setSelectedMarker(null);
  renderRiskList();
}

sheetEl.addEventListener('click', (ev) => {
  const t = (ev.target as HTMLElement).closest<HTMLElement>(
    '[data-close],[data-open],[data-goto],[data-label],[data-save-place],[data-remove-place],[data-cam-refresh]',
  );
  if (!t) return;
  if (t.dataset.label) {
    sheetEl.querySelectorAll('[data-label]').forEach((b) => b.setAttribute('aria-pressed', String(b === t)));
  } else if (t.dataset.savePlace && state.tempPlace?.id === t.dataset.savePlace) {
    const label = sheetEl.querySelector<HTMLElement>('[data-label][aria-pressed="true"]')?.dataset.label ?? 'อื่น ๆ';
    // id ใหม่ทุกครั้ง เพื่อไม่ให้ชนกัน (เช่น บันทึก "ตำแหน่งของฉัน" หลายครั้ง)
    const place = { ...state.tempPlace, id: `pl-${Date.now().toString(36)}`, label };
    state.places = [...state.places, place];
    state.tempPlace = null;
    if (!storePlaces(state.places)) alert('บันทึกในเครื่องนี้ไม่ได้ (อาจเปิดโหมดส่วนตัวอยู่) — จุดนี้จะหายเมื่อปิดแอป');
    renderPlaces();
    openEntity('place', place.id, false);
  } else if (t.dataset.removePlace) {
    state.places = state.places.filter((p) => p.id !== t.dataset.removePlace);
    storePlaces(state.places);
    closeSheet();
    renderPlaces();
  } else if (t.dataset.camRefresh !== undefined) startSheetCamera(true); else if (t.dataset.close !== undefined) closeSheet();
  else if (t.dataset.open) {
    const [kind, ...rest] = t.dataset.open.split(':');
    openEntity(kind as LayerKey, rest.join(':'));
  } else if (t.dataset.goto) showView(t.dataset.goto as View);
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !sheetEl.hidden && !document.body.classList.contains('searching')) closeSheet();
});

// ---------- แผนที่: วาดหมุด ----------
function addMarker(
  kind: LayerKey,
  id: string,
  loc: { lat: number; lng: number },
  status: Status,
  title: string,
  extra = '',
) {
  const selected = state.selected?.kind === kind && state.selected.id === id;
  const marker = L.marker([loc.lat, loc.lng], { icon: pinIcon(kind, status, selected, extra), title, keyboard: true })
    .on('click', () => openEntity(kind, id, false))
    .addTo(layers[kind]);
  markers.set(`${kind}:${id}`, { marker, kind, status, extra });
}

function renderMap() {
  Object.values(layers).forEach((l) => l.clearLayers());
  markers.clear();
  for (const s of state.water?.data ?? []) addMarker('water', s.id, s.location, s.status, s.name);
  for (const s of state.rain?.data ?? []) addMarker('rain', s.id, s.location, s.status, s.name);
  for (const g of state.gates?.data ?? []) addMarker('gate', g.id, g.location, 'unknown', g.name);
  for (const f of state.forecast?.data ?? []) addMarker('forecast', f.id, f.location, f.status, 'พยากรณ์ Google');
  // กล้องที่ดูภาพสดในแอปได้ ใช้หมุดสีน้ำเงินเข้ม
  for (const c of state.cameras?.data ?? []) {
    const live = isLiveCamera(c);
    addMarker('camera', c.id, c.location, 'unknown', live ? `${c.name} (ภาพสด)` : c.name, live ? 'pin-live' : '');
  }

  // ปุ่มชั้นข้อมูลที่ไม่มีข้อมูลจะซ่อนไว้
  const has: Record<LayerKey, boolean> = {
    water: true,
    rain: true,
    camera: !!state.cameras?.data.length,
    gate: !!state.gates?.data.length,
    forecast: !!state.forecast?.data.length,
    place: true,
  };
  document.querySelectorAll<HTMLButtonElement>('[data-layer]').forEach((b) => {
    b.hidden = !has[b.dataset.layer as LayerKey];
  });
  renderLegend(has);

  // ข้อมูลใหม่อาจไม่มีจุดที่เลือกไว้แล้ว
  if (state.selected && !findEntity(state.selected.kind, state.selected.id)) closeSheet();
  else if (state.selected && !sheetEl.hidden) {
    const e = findEntity(state.selected.kind, state.selected.id)!;
    sheetEl.innerHTML = renderSheet(e);
  }
}

function renderLegend(has: Record<LayerKey, boolean>) {
  const items = (['normal', 'watch', 'warning', 'critical'] as Status[]).map(
    (s) => `<span><i class="st-${s}"></i>${STATUS_LABEL_TH[s]}</span>`,
  );
  if (has.camera) {
    const cams = state.cameras?.data ?? [];
    if (cams.some(isLiveCamera)) items.push('<span><i class="sq sq-live"></i>กล้องภาพสด</span>');
    if (cams.some((c) => !isLiveCamera(c))) items.push('<span><i class="sq"></i>กล้อง</span>');
  }
  document.getElementById('legend')!.innerHTML = items.join('');
}

document.querySelectorAll<HTMLButtonElement>('[data-layer]').forEach((b) =>
  b.addEventListener('click', () => {
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(on));
    const layer = layers[b.dataset.layer as LayerKey];
    if (on) layer.addTo(map);
    else layer.remove();
  }),
);

const legendToggle = document.getElementById('legend-toggle')!;
legendToggle.addEventListener('click', () => {
  const open = document.getElementById('legend')!.classList.toggle('is-open');
  legendToggle.setAttribute('aria-expanded', String(open));
});

// ---------- สรุป / รายการเฝ้าระวัง ----------
interface RiskItem {
  kind: 'water' | 'rain' | 'forecast';
  id: string;
  name: string;
  status: Status;
  metric: string;
  percent: number | null;
  place: string;
  observedAt: string;
  lat: number;
  lng: number;
}

function riskItems(): RiskItem[] {
  const items: RiskItem[] = [
    ...(state.water?.data ?? []).map((s) => ({
      kind: 'water' as const,
      id: s.id,
      name: s.name,
      status: s.status,
      metric: `${formatNum(s.percent, 1)}% ตลิ่ง${s.trend && s.trend.direction !== 'steady' ? ` ${trendText(s.trend, true)}` : ''}`,
      percent: s.percent,
      place: formatPlace(s.location.province, s.location.district),
      observedAt: s.observedAt,
      ...s.location,
    })),
    ...(state.rain?.data ?? []).map((s) => ({
      kind: 'rain' as const,
      id: s.id,
      name: s.name,
      status: s.status,
      metric: `ฝน 24 ชม. ${formatNum(s.rain24h, 1)} มม.`,
      percent: null,
      place: formatPlace(s.location.province, s.location.district),
      observedAt: s.observedAt,
      ...s.location,
    })),
    ...(state.forecast?.data ?? []).map((f) => ({
      kind: 'forecast' as const,
      id: f.id,
      name: 'พยากรณ์น้ำล้นตลิ่ง (Google)',
      status: f.status,
      metric: `${FLOODHUB_SEVERITY_TH[f.severity]}${f.trend ? ` · ${TREND_TH[f.trend] ?? f.trend}` : ''}`,
      percent: null,
      place: f.forecastStart ? `เริ่ม ${formatTime(f.forecastStart)}` : '',
      observedAt: f.issuedAt ?? '',
      ...f.location,
    })),
  ].filter((i) => i.status !== 'normal' && i.status !== 'unknown');

  const pos = state.userPos;
  return items.sort((a, b) => {
    if (state.sort === 'near' && pos) return distanceKm(pos, a) - distanceKm(pos, b);
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (byStatus || !pos) return byStatus;
    return distanceKm(pos, a) - distanceKm(pos, b);
  });
}

function renderSummary(items: RiskItem[]) {
  const count = (s: Status) => items.filter((i) => i.status === s).length;
  const pills = (['critical', 'warning', 'watch'] as Status[])
    .map(
      (s) =>
        `<div class="sum-pill soft-${s}"><span class="dot st-${s}"></span><span>${STATUS_LABEL_TH[s]}</span><span class="sum-count">${count(
          s,
        )}</span></div>`,
    )
    .join('');
  document.querySelectorAll<HTMLElement>('[data-summary]').forEach((el) => (el.innerHTML = pills));
  const badge = document.getElementById('tab-badge')!;
  badge.hidden = items.length === 0;
  badge.textContent = String(items.length);
}

function renderRiskList() {
  const items = riskItems();
  renderSummary(items);
  const oldest = oldestFetch();
  document.getElementById('watch-meta')!.textContent =
    `${items.length} จุด${oldest ? ` · อัปเดต ${formatClock(new Date(oldest).toISOString())}` : ''}`;

  const el = document.getElementById('risk-list')!;
  const more = document.getElementById('risk-more')!;
  if (!items.length) {
    el.innerHTML = '<li class="card card-empty">ไม่มีจุดที่อยู่ในระดับเฝ้าระวังขึ้นไปในขณะนี้</li>';
    more.hidden = true;
    return;
  }
  const shown = state.showAllRisks ? items : items.slice(0, RISK_PAGE);
  el.innerHTML = shown
    .map((i) => {
      const active = state.selected?.kind === i.kind && state.selected.id === i.id;
      const dist = state.userPos ? ` · ${formatDistance(distanceKm(state.userPos, i))}` : '';
      const bar =
        i.percent !== null
          ? `<span class="bar bar-sm"><span class="st-${i.status}" style="width:${Math.max(0, Math.min(100, i.percent))}%"></span></span>`
          : '';
      return `
      <li>
        <button type="button" class="risk${active ? ' is-active' : ''}" data-open="${i.kind}:${escapeHtml(i.id)}">
          <span class="risk-icon st-${i.status}">${LETTER[i.kind]}</span>
          <span class="risk-body">
            <span class="risk-top"><span class="risk-name">${escapeHtml(i.name)}</span><span class="badge-soft soft-${i.status}">${
              STATUS_LABEL_TH[i.status]
            }</span></span>
            <span class="risk-metric ink-${i.status}">${bar}<span>${escapeHtml(i.metric)}</span></span>
            <span class="risk-meta">${escapeHtml(i.place)}${dist}${i.observedAt ? ` · ${formatAgo(i.observedAt)}` : ''}</span>
          </span>
        </button>
      </li>`;
    })
    .join('');
  more.hidden = items.length <= RISK_PAGE;
  more.textContent = state.showAllRisks ? 'แสดงน้อยลง' : `ดูอีก ${items.length - RISK_PAGE} จุด`;
}

document.getElementById('risk-list')!.addEventListener('click', (ev) => {
  const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-open]');
  if (!b) return;
  const [kind, ...rest] = b.dataset.open!.split(':');
  openEntity(kind as LayerKey, rest.join(':'));
});
document.getElementById('risk-more')!.addEventListener('click', () => {
  state.showAllRisks = !state.showAllRisks;
  renderRiskList();
});
document.querySelectorAll<HTMLButtonElement>('[data-sort]').forEach((b) =>
  b.addEventListener('click', async () => {
    const sort = b.dataset.sort as State['sort'];
    if (sort === 'near' && !state.userPos && !(await locate(false))) return;
    state.sort = sort;
    document
      .querySelectorAll<HTMLButtonElement>('[data-sort]')
      .forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.sort === sort)));
    renderRiskList();
  }),
);

function renderKeyStations() {
  const el = document.getElementById('key-list')!;
  const list = state.keyStations?.data ?? [];
  const rows = list
    .map(
      (s) => `
      <li class="tl-row">
        <span class="tl-rail"><span class="tl-dot st-${s.status}"></span><span class="tl-line"></span></span>
        <span class="tl-body">
          <span><span class="tl-name">${escapeHtml(s.code ? `${s.code} ` : '')}${escapeHtml(s.name)}</span><br />
          <span class="tl-status ink-${s.status}">${STATUS_LABEL_TH[s.status]} · ${escapeHtml(
            formatPlace(s.location.province, s.location.district, s.location.provinceName),
          )}</span>${s.trend ? `<br /><span class="tl-trend">${escapeHtml(trendText(s.trend))}</span>` : ''}</span>
          <span class="tl-value ink-${s.status}">${formatNum(s.percent, 0)}%${s.trend && s.trend.direction !== 'steady' ? ` ${trendText(s.trend, true)}` : ''}</span>
        </span>
      </li>`,
    )
    .join('');
  el.innerHTML =
    (rows || '<li class="card-empty">ยังไม่มีข้อมูลสถานีต้นน้ำ</li>') +
    `<li class="tl-home"><span>${icons.home()}</span><span>กรุงเทพฯ และปริมณฑล</span></li>`;
}

// ---------- จุดที่ติดตาม ----------
function renderPlaces() {
  layers.place.clearLayers();
  for (const [key] of markers) if (key.startsWith('place:')) markers.delete(key);
  const all = [...state.places.map((p) => toPlaceItem(p, true)), ...(state.tempPlace ? [toPlaceItem(state.tempPlace, false)] : [])];
  for (const p of all) addMarker('place', p.id, p.location, 'unknown', p.label || p.name);

  const el = document.getElementById('saved-list')!;
  if (!state.places.length) {
    el.innerHTML = `<li class="card card-empty">ค้นหาสถานที่ เช่น บ้าน หรือที่ทำงาน แล้วกด "บันทึกจุดนี้" เพื่อดูสถานการณ์รอบจุดได้ทันที</li>`;
    return;
  }
  const inputs = nearbyInputs();
  el.innerHTML = state.places
    .map((p) => {
      const area = summarizeArea(p, inputs);
      const nearestWater = area.items.filter((i) => i.kind === 'water').sort((a, b) => a.distKm - b.distKm)[0];
      const badge =
        area.worst === 'unknown'
          ? '<span class="badge-soft soft-unknown">ไม่มีสถานี</span>'
          : `<span class="badge-soft soft-${area.worst}">${STATUS_LABEL_TH[area.worst]}</span>`;
      return `
      <li>
        <button type="button" class="risk" data-open="place:${escapeHtml(p.id)}">
          <span class="risk-icon place-icon">${icons.star(20)}</span>
          <span class="risk-body">
            <span class="risk-top"><span class="risk-name">${escapeHtml(p.label)} · ${escapeHtml(p.name)}</span>${badge}</span>
            <span class="risk-metric ink-${area.worst}">รัศมี ${PLACE_RADIUS_KM} กม.: ${escapeHtml(areaLine(area.counts))}</span>
            <span class="risk-meta">${
              nearestWater ? `ใกล้สุด: ${escapeHtml(nearestWater.text)} (${formatDistance(nearestWater.distKm)})` : escapeHtml(p.detail)
            }</span>
          </span>
        </button>
      </li>`;
    })
    .join('');
}

document.getElementById('saved-list')!.addEventListener('click', (ev) => {
  const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-open]');
  if (!b) return;
  openEntity('place', b.dataset.open!.slice('place:'.length));
});

// ---------- กล้อง CCTV / แหล่งข้อมูล ----------
function linkCard(l: CameraLink, icon: string): string {
  return `
    <li>
      <a class="link-card" href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">
        <span class="link-icon">${icon}</span>
        <span class="link-text">
          <span class="link-name">${escapeHtml(l.name)}${l.area ? `<span class="tag">เฉพาะ ${escapeHtml(l.area)}</span>` : ''}</span>
          <span class="link-desc">${escapeHtml(l.description)}</span>
        </span>
        ${icons.external(18)}
      </a>
    </li>`;
}

function renderLinks(cameras: CameraLink[], official: CameraLink[]) {
  const [hero, ...rest] = cameras;
  document.getElementById('cctv-hero')!.innerHTML = hero
    ? `<div class="hero">
        <div class="hero-top">
          <span class="hero-icon">${icons.camera(22)}</span>
          <span><span class="hero-area">${hero.area ? `สำหรับคน ${escapeHtml(hero.area)}` : 'กล้อง CCTV'}</span><br />
          <span class="hero-name">${escapeHtml(hero.name)}</span></span>
        </div>
        <p>${escapeHtml(hero.description)}</p>
        <a class="btn-primary" href="${escapeHtml(hero.url)}" target="_blank" rel="noopener noreferrer">เปิดดูกล้อง ${icons.external()}</a>
      </div>`
    : '';
  const iconFor = (l: CameraLink) =>
    l.id.includes('flood') ? icons.roadFlood() : l.id.includes('doh') ? icons.road() : icons.pin();
  document.getElementById('camera-links')!.innerHTML = rest.map((l) => linkCard(l, iconFor(l))).join('');
  document.getElementById('official-links')!.innerHTML = official.map((l) => linkCard(l, icons.info(20))).join('');
}

// ---------- แถบแจ้งเตือน ----------
function allResponses(): ApiResponse<unknown>[] {
  return [state.water, state.rain, state.gates, state.keyStations, state.forecast, state.cameras].filter(
    Boolean,
  ) as ApiResponse<unknown>[];
}

function oldestFetch(): number | undefined {
  return allResponses()
    .filter((r) => !r.sample)
    .map((r) => new Date(r.fetchedAt).getTime())
    .sort()[0] ?? (allResponses().length ? Date.now() : undefined);
}

function renderBanners() {
  const msgs: Array<[string, string]> = [];
  if (!navigator.onLine) msgs.push(['warn', 'ออฟไลน์อยู่ — แสดงข้อมูลชุดล่าสุดที่เคยโหลดไว้']);
  const all = allResponses();
  if (all.some((r) => r.sample)) msgs.push(['danger', 'กำลังแสดงข้อมูลตัวอย่างสำหรับทดสอบ ไม่ใช่สถานการณ์จริง']);
  const oldest = oldestFetch();
  if (all.some((r) => r.stale) || (oldest && Date.now() - oldest > STALE_AFTER_MIN * 60000)) {
    msgs.push(['warn', `ข้อมูลบางส่วนอาจไม่เป็นปัจจุบัน (อัปเดตล่าสุด ${formatAgo(new Date(oldest!).toISOString())})`]);
  }
  for (const e of state.errors) msgs.push(['warn', e]);
  document.getElementById('banners')!.innerHTML = msgs
    .map(([kind, m]) => `<div class="banner ${kind}">${escapeHtml(m)}</div>`)
    .join('');
  const updated = oldest ? `อัปเดต ${formatClock(new Date(oldest).toISOString())}` : '';
  document.querySelectorAll<HTMLElement>('[data-updated]').forEach((el) => (el.textContent = updated));
}

// ---------- โหลดข้อมูล ----------
let loading = false;
async function loadAll() {
  if (loading) return;
  loading = true;
  document.body.classList.add('loading');
  const [water, rain, gates, keyStations, forecast, cameras] = await Promise.allSettled([
    api.waterLevel(),
    api.rain(),
    api.floodgates(),
    api.keyStations(),
    api.floodForecast(),
    api.cameras(),
  ]);
  // API ถูก ThaiWater จำกัดความถี่ (HTTP 429) → ดึงตรงจากเครื่องผู้ใช้แทน
  const direct = directThaiWater();
  const orDirect = async <T>(r: PromiseSettledResult<T>, load: () => Promise<T>): Promise<PromiseSettledResult<T>> => {
    if (r.status === 'fulfilled') return r;
    const [again] = await Promise.allSettled([load()]);
    return again.status === 'fulfilled' ? again : r;
  };
  const [water2, rain2, keyStations2] = await Promise.all([
    orDirect(water, direct.waterLevel),
    orDirect(rain, direct.rain),
    orDirect(keyStations, direct.keyStations),
  ]);
  state.errors = [];
  const take = <T>(r: PromiseSettledResult<T>, label: string, prev: T | null): T | null => {
    if (r.status === 'fulfilled') return r.value;
    state.errors.push(`โหลดข้อมูล${label}ไม่สำเร็จ: ${(r.reason as Error).message}`);
    return prev;
  };
  state.water = take(water2, 'ระดับน้ำ', state.water);
  state.rain = take(rain2, 'ฝน', state.rain);
  state.gates = take(gates, 'ประตูระบายน้ำ', state.gates);
  state.keyStations = take(keyStations2, 'สถานีต้นน้ำ', state.keyStations);
  state.forecast = take(forecast, 'พยากรณ์ Google', state.forecast);
  state.cameras = take(cameras, 'กล้อง CCTV', state.cameras);
  renderMap();
  renderRiskList();
  renderKeyStations();
  renderPlaces();
  renderBanners();
  document.body.classList.remove('loading');
  loading = false;
}

async function loadLinks() {
  try {
    const { cameras, official } = await api.links();
    renderLinks(cameras, official);
  } catch {
    document.getElementById('camera-links')!.innerHTML = '<li class="card card-empty">โหลดรายการไม่สำเร็จ กรุณาลองใหม่</li>';
  }
}

// ---------- ตำแหน่งของฉัน ----------
let userMarker: L.CircleMarker | null = null;
function locate(moveMap = true): Promise<boolean> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      alert('อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง');
      return resolve(false);
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        userMarker?.remove();
        userMarker = L.circleMarker([state.userPos.lat, state.userPos.lng], { radius: 8, className: 'me-dot' }).addTo(map);
        if (moveMap) {
          ensureMapVisible();
          map.setView([state.userPos.lat, state.userPos.lng], 14);
        }
        renderRiskList();
        resolve(true);
      },
      () => {
        alert('ไม่สามารถระบุตำแหน่งได้ กรุณาอนุญาตการเข้าถึงตำแหน่ง');
        resolve(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}
document.getElementById('locate')!.addEventListener('click', () => void locate());
document.getElementById('refresh')!.addEventListener('click', () => void loadAll());

// ---------- ค้นหา ----------
function showTempPlace(p: SavedPlace) {
  const existing = state.places.find((s) => Math.abs(s.lat - p.lat) < 1e-5 && Math.abs(s.lng - p.lng) < 1e-5);
  if (existing) return openEntity('place', existing.id);
  state.tempPlace = p;
  renderPlaces();
  openEntity('place', p.id);
}
initSearch({
  getStations: () => [
    ...(state.water?.data ?? []).map((s) => ({
      kind: 'water' as const,
      id: s.id,
      name: s.name,
      status: s.status,
      detail: `${STATUS_LABEL_TH[s.status]} · ${formatNum(s.percent, 0)}% ของตลิ่ง`,
      place: formatPlace(s.location.province, s.location.district),
    })),
    ...(state.rain?.data ?? []).map((s) => ({
      kind: 'rain' as const,
      id: s.id,
      name: s.name,
      status: s.status,
      detail: `${STATUS_LABEL_TH[s.status]} · ฝน ${formatNum(s.rain24h, 1)} มม.`,
      place: formatPlace(s.location.province, s.location.district),
    })),
  ],
  getCameras: () => state.cameras?.data ?? [],
  openEntity: (kind, id) => openEntity(kind, id),
  goToPlace: (p) => showTempPlace({ id: `tmp-${p.id}`, label: '', name: p.name, detail: p.detail, lat: p.lat, lng: p.lng }),
  locate: async () => {
    if (!(await locate(false)) || !state.userPos) return;
    showTempPlace({ id: 'tmp-me', label: '', name: 'ตำแหน่งของฉัน', detail: '', ...state.userPos });
  },
});

// ---------- เริ่มต้น ----------
window.addEventListener('online', () => void loadAll());
window.addEventListener('offline', renderBanners);
setInterval(() => {
  if (document.visibilityState === 'visible') void loadAll();
}, AUTO_REFRESH_MS);
DESKTOP.addEventListener('change', () => showView(document.body.dataset.view as View));

showView('map');
void loadAll();
void loadLinks();
