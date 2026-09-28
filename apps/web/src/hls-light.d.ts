// hls.js รุ่นเบา (ไม่มีคำบรรยาย/DRM) ใช้ type เดียวกับรุ่นเต็ม
declare module 'hls.js/light' {
  export * from 'hls.js';
  export { default } from 'hls.js';
}
