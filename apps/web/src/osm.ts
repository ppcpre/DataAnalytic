import L from 'leaflet';

/** แผนที่ฐานสำรองแบบภาพ (raster) จาก OpenStreetMap — ใช้ได้กับทุกเบราว์เซอร์ */
export function addOsmRaster(map: L.Map) {
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
}

/**
 * MapLibre v6 ต้องใช้ WebGL2 และ JavaScript รุ่นใหม่ (เช่น Safari/iPadOS 16.4 ขึ้นไป)
 * ตรวจก่อนโหลด เพื่อไม่ให้แผนที่ว่างบนเครื่องรุ่นเก่า
 */
export function vectorMapSupported(): boolean {
  try {
    if (!document.createElement('canvas').getContext('webgl2')) return false;
    // class static block — ถ้าเบราว์เซอร์อ่านไม่ได้ ไฟล์ของ MapLibre ก็จะโหลดไม่ขึ้น
    new Function('class A { static { } }');
    return true;
  } catch {
    return false;
  }
}
