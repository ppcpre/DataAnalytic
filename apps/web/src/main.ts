import 'leaflet/dist/leaflet.css';
import './style.css';
import L from 'leaflet';
import { registerSW } from 'virtual:pwa-register';
import {
  FLOODHUB_SEVERITY_TH,
  STATUS_LABEL_TH,
  type ApiResponse,
  type CameraLink,
  type FloodForecast,
  type Floodgate,
  type RainStation,
  type Status,
  type WaterLevelStation,
} from '@flood-watch/shared';
import { api } from './api';
import { STATUS_ORDER, distanceKm, escapeHtml, formatAgo, formatNum, formatPlace, formatTime } from './format';

registerSW({ immediate: true });

/** ข้อมูลที่เก่ากว่านี้จะแสดงคำเตือน */
const STALE_AFTER_MIN = 45;
const AUTO_REFRESH_MS = 5 * 60 * 1000;
const BKK_CENTER: L.LatLngExpression = [13.78, 100.52];

// ---------- แผนที่ ----------
// เว้นที่ด้านบนให้ popup ไม่ถูกปุ่มชั้นข้อมูลบัง
L.Popup.prototype.options.autoPanPaddingTopLeft = L.point(10, 150);
const map = L.map('map', { zoomControl: false }).setView(BKK_CENTER, 11);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

type LayerKey = 'water' | 'rain' | 'gate' | 'forecast';
const layers: Record<LayerKey, L.LayerGroup> = {
  water: L.layerGroup().addTo(map),
  rain: L.layerGroup().addTo(map),
  gate: L.layerGroup().addTo(map),
  forecast: L.layerGroup().addTo(map),
};

const SYMBOL: Record<LayerKey, string> = { water: 'น', rain: 'ฝ', gate: 'ป', forecast: 'ส' };

const TREND_TH: Record<string, string> = {
  RISE: 'มีแนวโน้มสูงขึ้น',
  FALL: 'มีแนวโน้มลดลง',
  NO_CHANGE: 'ทรงตัว',
  REMAIN: 'ทรงตัว',
};

function icon(kind: LayerKey, status: Status): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<span class="pin pin-${kind} st-${status}" aria-hidden="true">${SYMBOL[kind]}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

function statusBadge(status: Status): string {
  return `<span class="badge st-${status}">${STATUS_LABEL_TH[status]}</span>`;
}

function waterPopup(s: WaterLevelStation): string {
  return `
    <strong>${escapeHtml(s.name)}</strong> ${statusBadge(s.status)}
    <div class="muted">${escapeHtml(formatPlace(s.location.province, s.location.district))}</div>
    <dl>
      <dt>ระดับน้ำ</dt><dd>${formatNum(s.levelMsl)} ม.รทก.</dd>
      <dt>ระดับตลิ่ง</dt><dd>${formatNum(s.bankMsl)} ม.รทก.</dd>
      <dt>ความจุลำน้ำ</dt><dd>${formatNum(s.percent, 1)}%</dd>
      <dt>เวลาวัด</dt><dd>${formatTime(s.observedAt)}</dd>
      <dt>หน่วยงาน</dt><dd>${escapeHtml(s.agency)}</dd>
    </dl>`;
}

function rainPopup(s: RainStation): string {
  return `
    <strong>${escapeHtml(s.name)}</strong> ${statusBadge(s.status)}
    <div class="muted">${escapeHtml(formatPlace(s.location.province, s.location.district))}</div>
    <dl>
      <dt>ฝนสะสม 24 ชม.</dt><dd>${formatNum(s.rain24h, 1)} มม.</dd>
      <dt>เวลาวัด</dt><dd>${formatTime(s.observedAt)}</dd>
      <dt>หน่วยงาน</dt><dd>${escapeHtml(s.agency)}</dd>
    </dl>`;
}

function gatePopup(g: Floodgate): string {
  const diff =
    g.upstreamMsl !== null && g.downstreamMsl !== null ? formatNum(g.upstreamMsl - g.downstreamMsl) : '–';
  return `
    <strong>${escapeHtml(g.name)}</strong>
    <div class="muted">${escapeHtml(formatPlace(g.location.province, g.location.district))}</div>
    <dl>
      <dt>ระดับน้ำเหนือประตู</dt><dd>${formatNum(g.upstreamMsl)} ม.รทก.</dd>
      <dt>ระดับน้ำท้ายประตู</dt><dd>${formatNum(g.downstreamMsl)} ม.รทก.</dd>
      <dt>ผลต่างระดับน้ำ</dt><dd>${diff} ม.</dd>
      <dt>เวลาวัด</dt><dd>${formatTime(g.observedAt)}</dd>
      <dt>หน่วยงาน</dt><dd>${escapeHtml(g.agency)}</dd>
    </dl>`;
}

function forecastPopup(f: FloodForecast): string {
  const window =
    f.forecastStart || f.forecastEnd ? `${formatTime(f.forecastStart)} – ${formatTime(f.forecastEnd)}` : '–';
  return `
    <strong>พยากรณ์น้ำล้นตลิ่ง (Google Flood Hub)</strong> ${statusBadge(f.status)}
    <dl>
      <dt>ระดับที่คาด</dt><dd>${escapeHtml(FLOODHUB_SEVERITY_TH[f.severity])}</dd>
      <dt>แนวโน้ม</dt><dd>${escapeHtml(f.trend ? (TREND_TH[f.trend] ?? f.trend) : '–')}</dd>
      <dt>ช่วงเวลาพยากรณ์</dt><dd>${window}</dd>
      <dt>ออกพยากรณ์เมื่อ</dt><dd>${formatTime(f.issuedAt)}</dd>
    </dl>
    <a href="https://sites.research.google/floods" target="_blank" rel="noopener noreferrer">ดูรายละเอียดใน Google Flood Hub ↗</a>`;
}

// ---------- สถานะข้อมูล ----------
interface State {
  water: ApiResponse<WaterLevelStation> | null;
  rain: ApiResponse<RainStation> | null;
  gates: ApiResponse<Floodgate> | null;
  keyStations: ApiResponse<WaterLevelStation> | null;
  forecast: ApiResponse<FloodForecast> | null;
  errors: string[];
}
const state: State = { water: null, rain: null, gates: null, keyStations: null, forecast: null, errors: [] };

const bannersEl = document.getElementById('banners')!;
function renderBanners() {
  const msgs: Array<[string, string]> = [];
  if (!navigator.onLine) msgs.push(['warn', 'ออฟไลน์อยู่ — แสดงข้อมูลชุดล่าสุดที่เคยโหลดไว้']);
  const all = [state.water, state.rain, state.gates, state.keyStations, state.forecast].filter(
    Boolean,
  ) as ApiResponse<unknown>[];
  if (all.some((r) => r.sample)) {
    msgs.push(['danger', 'กำลังแสดงข้อมูลตัวอย่างสำหรับทดสอบ ไม่ใช่สถานการณ์จริง']);
  }
  const oldest = all.map((r) => new Date(r.fetchedAt).getTime()).sort()[0];
  if (all.some((r) => r.stale) || (oldest && Date.now() - oldest > STALE_AFTER_MIN * 60000)) {
    msgs.push(['warn', `ข้อมูลบางส่วนอาจไม่เป็นปัจจุบัน (อัปเดตล่าสุด ${formatAgo(new Date(oldest).toISOString())})`]);
  }
  for (const e of state.errors) msgs.push(['warn', e]);
  if (all.length && !msgs.length) {
    msgs.push(['info', `อัปเดตล่าสุด ${formatTime(new Date(oldest).toISOString())}`]);
  }
  bannersEl.innerHTML = msgs.map(([kind, m]) => `<div class="banner ${kind}">${escapeHtml(m)}</div>`).join('');
}

// ---------- วาดข้อมูล ----------
function renderMap() {
  layers.water.clearLayers();
  layers.rain.clearLayers();
  layers.gate.clearLayers();
  layers.forecast.clearLayers();
  for (const s of state.water?.data ?? []) {
    L.marker([s.location.lat, s.location.lng], { icon: icon('water', s.status), title: s.name })
      .bindPopup(waterPopup(s))
      .addTo(layers.water);
  }
  for (const s of state.rain?.data ?? []) {
    L.marker([s.location.lat, s.location.lng], { icon: icon('rain', s.status), title: s.name })
      .bindPopup(rainPopup(s))
      .addTo(layers.rain);
  }
  for (const g of state.gates?.data ?? []) {
    L.marker([g.location.lat, g.location.lng], { icon: icon('gate', 'unknown'), title: g.name })
      .bindPopup(gatePopup(g))
      .addTo(layers.gate);
  }
  for (const f of state.forecast?.data ?? []) {
    L.marker([f.location.lat, f.location.lng], { icon: icon('forecast', f.status), title: 'พยากรณ์ Google' })
      .bindPopup(forecastPopup(f))
      .addTo(layers.forecast);
  }
}

function renderKeyStations() {
  const el = document.getElementById('key-list')!;
  const list = state.keyStations?.data ?? [];
  if (!list.length) {
    el.innerHTML = `<li class="card muted">ยังไม่มีข้อมูลสถานีต้นน้ำ</li>`;
    return;
  }
  el.innerHTML = list
    .map(
      (s) => `
      <li class="card">
        <div class="card-btn">
          <span class="card-title">${escapeHtml(s.code ? `${s.code} ` : '')}${escapeHtml(s.name)} ${statusBadge(s.status)}</span>
          <span>ระดับน้ำ ${formatNum(s.percent, 1)}% ของตลิ่ง${
            s.levelMsl !== null ? ` (${formatNum(s.levelMsl)} ม.รทก.)` : ''
          }</span>
          <span class="muted">${escapeHtml(
            formatPlace(s.location.province, s.location.district, s.location.provinceName),
          )} · ${formatAgo(s.observedAt)}</span>
        </div>
      </li>`,
    )
    .join('');
}

interface RiskItem {
  kind: 'water' | 'rain' | 'forecast';
  name: string;
  status: Status;
  detail: string;
  place: string;
  observedAt: string;
  lat: number;
  lng: number;
}

let userPos: { lat: number; lng: number } | null = null;

function renderRiskList() {
  const items: RiskItem[] = [
    ...(state.water?.data ?? []).map((s) => ({
      kind: 'water' as const,
      name: s.name,
      status: s.status,
      detail: `ระดับน้ำ ${formatNum(s.percent, 1)}% ของตลิ่ง`,
      place: formatPlace(s.location.province, s.location.district),
      observedAt: s.observedAt,
      ...s.location,
    })),
    ...(state.forecast?.data ?? []).map((f) => ({
      kind: 'forecast' as const,
      name: 'พยากรณ์น้ำล้นตลิ่ง (Google)',
      status: f.status,
      detail: `${FLOODHUB_SEVERITY_TH[f.severity]}${f.trend ? ` · ${TREND_TH[f.trend] ?? f.trend}` : ''}`,
      place: `ช่วง ${formatTime(f.forecastStart)}`,
      observedAt: f.issuedAt ?? '',
      ...f.location,
    })),
    ...(state.rain?.data ?? []).map((s) => ({
      kind: 'rain' as const,
      name: s.name,
      status: s.status,
      detail: `ฝน 24 ชม. ${formatNum(s.rain24h, 1)} มม.`,
      place: formatPlace(s.location.province, s.location.district),
      observedAt: s.observedAt,
      ...s.location,
    })),
  ]
    .filter((i) => i.status !== 'normal' && i.status !== 'unknown')
    .sort((a, b) => {
      const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (byStatus || !userPos) return byStatus;
      return distanceKm(userPos, a) - distanceKm(userPos, b);
    });

  const el = document.getElementById('risk-list')!;
  if (!items.length) {
    el.innerHTML = `<li class="card muted">ไม่มีจุดที่อยู่ในระดับเฝ้าระวังขึ้นไปในขณะนี้</li>`;
    return;
  }
  el.innerHTML = items
    .map(
      (i, idx) => `
      <li class="card">
        <button type="button" class="card-btn" data-idx="${idx}">
          <span class="card-title">${escapeHtml(i.name)} ${statusBadge(i.status)}</span>
          <span>${escapeHtml(i.detail)}</span>
          <span class="muted">${escapeHtml(i.place)}${
            userPos ? ` · ห่าง ${formatNum(distanceKm(userPos, i), 1)} กม.` : ''
          } · ${formatAgo(i.observedAt)}</span>
        </button>
      </li>`,
    )
    .join('');
  el.querySelectorAll<HTMLButtonElement>('.card-btn').forEach((btn) =>
    btn.addEventListener('click', () => {
      const i = items[Number(btn.dataset.idx)];
      showView('map');
      map.setView([i.lat, i.lng], 15);
    }),
  );
}

function renderLinks(target: string, links: CameraLink[]) {
  document.getElementById(target)!.innerHTML = links
    .map(
      (l) => `
      <li class="card">
        <a class="card-btn" href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">
          <span class="card-title">${escapeHtml(l.name)} ↗${l.area ? ` <span class="tag">เฉพาะ${escapeHtml(l.area)}</span>` : ''}</span>
          <span class="muted">${escapeHtml(l.description)}</span>
        </a>
      </li>`,
    )
    .join('');
}

// ---------- โหลดข้อมูล ----------
let loading = false;
async function loadAll() {
  if (loading) return;
  loading = true;
  document.body.classList.add('loading');
  const [water, rain, gates, keyStations, forecast] = await Promise.allSettled([
    api.waterLevel(),
    api.rain(),
    api.floodgates(),
    api.keyStations(),
    api.floodForecast(),
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
    renderLinks('camera-links', cameras);
    renderLinks('official-links', official);
  } catch {
    document.getElementById('camera-links')!.innerHTML =
      '<li class="card muted">โหลดรายการไม่สำเร็จ กรุณาลองใหม่</li>';
  }
}

// ---------- UI ----------
function showView(name: string) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  document
    .querySelectorAll<HTMLButtonElement>('.tabbar button')
    .forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'map') setTimeout(() => map.invalidateSize(), 0);
}

document.querySelectorAll<HTMLButtonElement>('.tabbar button').forEach((b) =>
  b.addEventListener('click', () => showView(b.dataset.view!)),
);

document.querySelectorAll<HTMLInputElement>('[data-layer]').forEach((cb) =>
  cb.addEventListener('change', () => {
    const layer = layers[cb.dataset.layer as LayerKey];
    if (cb.checked) layer.addTo(map);
    else layer.remove();
  }),
);

document.getElementById('refresh')!.addEventListener('click', () => void loadAll());

let userMarker: L.CircleMarker | null = null;
document.getElementById('locate')!.addEventListener('click', () => {
  if (!('geolocation' in navigator)) {
    alert('อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      userMarker?.remove();
      userMarker = L.circleMarker([userPos.lat, userPos.lng], { radius: 8, className: 'me' })
        .bindPopup('ตำแหน่งของคุณ')
        .addTo(map);
      map.setView([userPos.lat, userPos.lng], 14);
      renderRiskList();
    },
    () => alert('ไม่สามารถระบุตำแหน่งได้ กรุณาอนุญาตการเข้าถึงตำแหน่ง'),
    { enableHighAccuracy: true, timeout: 10000 },
  );
});

document.getElementById('legend')!.innerHTML = (['normal', 'watch', 'warning', 'critical'] as Status[])
  .map((s) => `<span><i class="dot st-${s}"></i>${STATUS_LABEL_TH[s]}</span>`)
  .join('');

window.addEventListener('online', () => void loadAll());
window.addEventListener('offline', renderBanners);
setInterval(() => {
  if (document.visibilityState === 'visible') void loadAll();
}, AUTO_REFRESH_MS);

void loadAll();
void loadLinks();
api
  .health()
  .then((h) => {
    document.getElementById('chip-forecast')!.hidden = !h.floodhub;
  })
  .catch(() => {});
