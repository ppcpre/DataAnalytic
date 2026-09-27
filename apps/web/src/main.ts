import 'leaflet/dist/leaflet.css';
import './style.css';
import L from 'leaflet';
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
import { renderHistoryChart, trendText } from './chart';

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
void import('./basemap').then((m) => m.addBasemap(map));

export type LayerKey = 'water' | 'rain' | 'camera' | 'gate' | 'forecast';
const layers: Record<LayerKey, L.LayerGroup> = {
  water: L.layerGroup().addTo(map),
  rain: L.layerGroup().addTo(map),
  camera: L.layerGroup().addTo(map),
  gate: L.layerGroup().addTo(map),
  forecast: L.layerGroup().addTo(map),
};
const LETTER: Record<Exclude<LayerKey, 'camera'>, string> = { water: 'น', rain: 'ฝ', gate: 'ป', forecast: 'ส' };

function pinHtml(kind: LayerKey, status: Status, selected = false): string {
  const cls = `pin pin-${kind} pin-${status} ${kind === 'camera' ? '' : `st-${status}`}${selected ? ' is-selected' : ''}`;
  const inner = kind === 'camera' ? icons.camera(16, 2.2) : LETTER[kind];
  return `<span class="${cls}" aria-hidden="true">${inner}</span>`;
}

function pinIcon(kind: LayerKey, status: Status, selected = false): L.DivIcon {
  const size = kind === 'gate' ? 28 : 30;
  return L.divIcon({
    className: '',
    html: pinHtml(kind, status, selected),
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
};

type Entity =
  | { kind: 'water'; item: WaterLevelStation }
  | { kind: 'rain'; item: RainStation }
  | { kind: 'gate'; item: Floodgate }
  | { kind: 'forecast'; item: FloodForecast }
  | { kind: 'camera'; item: Camera };

function findEntity(kind: LayerKey, id: string): Entity | null {
  const lists: Record<LayerKey, { id: string }[] | undefined> = {
    water: state.water?.data,
    rain: state.rain?.data,
    gate: state.gates?.data,
    forecast: state.forecast?.data,
    camera: state.cameras?.data,
  };
  const item = lists[kind]?.find((x) => x.id === id);
  return item ? ({ kind, item } as Entity) : null;
}

const markers = new Map<string, { marker: L.Marker; kind: LayerKey; status: Status }>();

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

function cameraButton(loc: { lat: number; lng: number }): string {
  const cam = nearestCamera(loc);
  if (cam) {
    return `<button type="button" class="btn-primary" data-open="camera:${escapeHtml(cam.id)}">${icons.camera(18)}ดูกล้อง CCTV ใกล้จุดนี้ (${formatDistance(
      distanceKm(loc, cam.location),
    )})</button>`;
  }
  return `<button type="button" class="btn-primary" data-goto="cctv">${icons.camera(18)}ดูกล้อง CCTV</button>`;
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
    <div class="sheet-sub">${escapeHtml(g.agency)} · ${formatTime(g.observedAt)}</div>`;
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
      `<span style="color:var(--brand);font-weight:600">กล้อง CCTV · ${escapeHtml(c.owner)}</span>`,
      c.name,
      escapeHtml(c.road ?? '') + distanceText(c.location),
      `<span class="cam-icon">${icons.camera(24)}</span>`,
    )}
    <div class="nearby">
      <span class="nearby-title">รอบกล้องนี้ (รัศมี ${NEARBY_KM} กม.)</span>
      ${nearby}
    </div>
    <a class="btn-primary" href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer">ดูภาพกล้องนี้ ${icons.external()}</a>
    <span class="btn-caption">เปิดในเว็บของ ${escapeHtml(c.owner)}</span>`;
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
  }
}

function setSelectedMarker(sel: State['selected']) {
  const prev = state.selected;
  state.selected = sel;
  for (const key of [prev, sel]) {
    if (!key) continue;
    const m = markers.get(`${key.kind}:${key.id}`);
    if (m) m.marker.setIcon(pinIcon(m.kind, m.status, sel?.kind === key.kind && sel.id === key.id));
  }
}

export function openEntity(kind: LayerKey, id: string, pan = true) {
  const e = findEntity(kind, id);
  if (!e) return;
  ensureMapVisible();
  sheetEl.innerHTML = renderSheet(e);
  sheetEl.hidden = false;
  void loadHistoryChart();
  document.body.classList.add('sheet-open');
  setSelectedMarker({ kind, id });
  // จัดให้จุดที่เลือกอยู่กลางพื้นที่แผนที่ที่ไม่ถูกแผ่นรายละเอียดบัง
  const loc = e.item.location;
  map.setView([loc.lat, loc.lng], pan ? Math.max(map.getZoom(), 14) : map.getZoom(), { animate: false });
  requestAnimationFrame(() => {
    if (window.innerWidth < 600) map.panBy([0, sheetEl.offsetHeight / 2]);
    else map.panBy([(sheetEl.offsetWidth + 16) / 2, 0]);
  });
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
      entry = { at: Date.now(), data: (await api.history(id, 24)).data };
      historyCache.set(id, entry);
    }
    // ผู้ใช้อาจเปิดจุดอื่นระหว่างรอ
    if (!host.isConnected) return;
    renderHistoryChart(host, entry.data, 24);
  } catch {
    if (host.isConnected) host.innerHTML = '<p class="chart-empty">โหลดข้อมูลย้อนหลังไม่สำเร็จ</p>';
  }
}

function closeSheet() {
  sheetEl.hidden = true;
  document.body.classList.remove('sheet-open');
  setSelectedMarker(null);
  renderRiskList();
}

sheetEl.addEventListener('click', (ev) => {
  const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-close],[data-open],[data-goto]');
  if (!t) return;
  if (t.dataset.close !== undefined) closeSheet();
  else if (t.dataset.open) {
    const [kind, ...rest] = t.dataset.open.split(':');
    openEntity(kind as LayerKey, rest.join(':'));
  } else if (t.dataset.goto) showView(t.dataset.goto as View);
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !sheetEl.hidden && !document.body.classList.contains('searching')) closeSheet();
});

// ---------- แผนที่: วาดหมุด ----------
function addMarker(kind: LayerKey, id: string, loc: { lat: number; lng: number }, status: Status, title: string) {
  const selected = state.selected?.kind === kind && state.selected.id === id;
  const marker = L.marker([loc.lat, loc.lng], { icon: pinIcon(kind, status, selected), title, keyboard: true })
    .on('click', () => openEntity(kind, id, false))
    .addTo(layers[kind]);
  markers.set(`${kind}:${id}`, { marker, kind, status });
}

function renderMap() {
  Object.values(layers).forEach((l) => l.clearLayers());
  markers.clear();
  for (const s of state.water?.data ?? []) addMarker('water', s.id, s.location, s.status, s.name);
  for (const s of state.rain?.data ?? []) addMarker('rain', s.id, s.location, s.status, s.name);
  for (const g of state.gates?.data ?? []) addMarker('gate', g.id, g.location, 'unknown', g.name);
  for (const f of state.forecast?.data ?? []) addMarker('forecast', f.id, f.location, f.status, 'พยากรณ์ Google');
  for (const c of state.cameras?.data ?? []) addMarker('camera', c.id, c.location, 'unknown', c.name);

  // ปุ่มชั้นข้อมูลที่ไม่มีข้อมูลจะซ่อนไว้
  const has: Record<LayerKey, boolean> = {
    water: true,
    rain: true,
    camera: !!state.cameras?.data.length,
    gate: !!state.gates?.data.length,
    forecast: !!state.forecast?.data.length,
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
  if (has.camera) items.push('<span><i class="sq"></i>กล้อง</span>');
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
  state.errors = [];
  const take = <T>(r: PromiseSettledResult<T>, label: string, prev: T | null): T | null => {
    if (r.status === 'fulfilled') return r.value;
    state.errors.push(`โหลดข้อมูล${label}ไม่สำเร็จ: ${(r.reason as Error).message}`);
    return prev;
  };
  state.water = take(water, 'ระดับน้ำ', state.water);
  state.rain = take(rain, 'ฝน', state.rain);
  state.gates = take(gates, 'ประตูระบายน้ำ', state.gates);
  state.keyStations = take(keyStations, 'สถานีต้นน้ำ', state.keyStations);
  state.forecast = take(forecast, 'พยากรณ์ Google', state.forecast);
  state.cameras = take(cameras, 'กล้อง CCTV', state.cameras);
  renderMap();
  renderRiskList();
  renderKeyStations();
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
let placeMarker: L.Marker | null = null;
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
  goToPlace: (lat, lng, name) => {
    ensureMapVisible();
    placeMarker?.remove();
    placeMarker = L.marker([lat, lng], {
      icon: L.divIcon({ className: '', html: '<span class="pin pin-place"></span>', iconSize: [22, 22], iconAnchor: [11, 22] }),
      title: name,
    }).addTo(map);
    map.setView([lat, lng], 15);
  },
  locate: () => void locate(),
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
