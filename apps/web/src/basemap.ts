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

/** แผนที่ vector โหลดไม่สำเร็จ → ใช้ OpenStreetMap แทน (แยกไว้ใน osm.ts เพื่อให้ใช้ได้แม้ไฟล์นี้โหลดไม่ขึ้น) */
export function addBasemap(map: L.Map, addOsmRaster: (map: L.Map) => void) {
  let layer: L.Layer;
  try {
    // plugin อ่านเครดิตจาก attributionControl.customAttribution แล้วส่งให้ attribution ของ Leaflet
    layer = maplibreGL({
      style: OPENFREEMAP_STYLE,
      attributionControl: { customAttribution: OPENFREEMAP_ATTRIBUTION },
    }).addTo(map);
  } catch (err) {
    console.warn('สร้างแผนที่ vector ไม่ได้ — ใช้แผนที่ OpenStreetMap แทน', err);
    addOsmRaster(map);
    return;
  }

  let loaded = false;
  let fellBack = false;
  const fallback = () => {
    if (loaded || fellBack) return;
    fellBack = true;
    console.warn('OpenFreeMap โหลดไม่สำเร็จ — ใช้แผนที่ OpenStreetMap แทน');
    map.removeLayer(layer);
    addOsmRaster(map);
  };

  const gl = (layer as ReturnType<typeof maplibreGL>).getMaplibreMap();
  gl.once('load', () => (loaded = true));
  // error ก่อน style โหลดเสร็จ = ใช้ OpenFreeMap ไม่ได้ (error ของ tile ย่อยหลังโหลดแล้วไม่นับ)
  gl.on('error', fallback);
  // worker ของ MapLibre โหลดไม่ขึ้นบนเบราว์เซอร์รุ่นเก่าโดยไม่แจ้ง error จึงตั้งเวลาไว้
  setTimeout(fallback, 10000);
}
