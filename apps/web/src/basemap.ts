import 'maplibre-gl/dist/maplibre-gl.css';
import L from 'leaflet';
import { setWorkerUrl } from 'maplibre-gl';
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet';

// ไฟล์ worker ถูกคัดลอกไว้ที่ /maplibre/ โดย plugin ใน vite.config.ts
setWorkerUrl(new URL(`${import.meta.env.BASE_URL}maplibre/maplibre-gl-worker.mjs`, location.href).href);

/** แผนที่ฐานแบบ vector จาก OpenFreeMap (ฟรี ไม่ต้องใช้ API key) */
const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const OPENFREEMAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
  '&copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> ' +
  'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

/** ใช้เมื่อโหลด OpenFreeMap ไม่สำเร็จ (เช่น เบราว์เซอร์ไม่รองรับ WebGL หรือเซิร์ฟเวอร์ล่ม) */
function addOsmRaster(map: L.Map) {
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
}

function webglSupported(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function addBasemap(map: L.Map) {
  if (!webglSupported()) {
    addOsmRaster(map);
    return;
  }

  // plugin อ่านเครดิตจาก attributionControl.customAttribution แล้วส่งให้ attribution ของ Leaflet
  const layer = maplibreGL({
    style: OPENFREEMAP_STYLE,
    attributionControl: { customAttribution: OPENFREEMAP_ATTRIBUTION },
  }).addTo(map);

  let loaded = false;
  let fellBack = false;
  const fallback = () => {
    if (loaded || fellBack) return;
    fellBack = true;
    console.warn('OpenFreeMap โหลดไม่สำเร็จ — ใช้แผนที่ OpenStreetMap แทน');
    map.removeLayer(layer);
    addOsmRaster(map);
  };

  const gl = layer.getMaplibreMap();
  gl.once('load', () => (loaded = true));
  // error ก่อน style โหลดเสร็จ = ใช้ OpenFreeMap ไม่ได้ (error ของ tile ย่อยหลังโหลดแล้วไม่นับ)
  gl.on('error', fallback);
  setTimeout(fallback, 15000);
}
