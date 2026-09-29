import type { Camera } from '@flood-watch/shared';

/**
 * กล้อง/จุดวัดระดับน้ำที่เพิ่มเอง (แสดงร่วมกับกล้องจาก Longdo Traffic)
 * - embedUrl: หน้าเว็บที่ฝังในหน้าต่างรายละเอียดได้ (ต้องเป็น https)
 * - url: ลิงก์ "เปิดดูในเว็บต้นทาง" (ใช้ได้ทั้ง http/https)
 * พิกัดเป็นค่าประมาณจากตำแหน่งท่าน้ำ/สถานี — ตรวจสอบและแก้ได้
 */
export const CAMERAS: Camera[] = [
  {
    id: 'water-nonthaburi-pier',
    name: 'ท่าน้ำนนทบุรี',
    road: 'แม่น้ำเจ้าพระยา',
    location: { lat: 13.8617, lng: 100.4959, province: '12', provinceName: 'นนทบุรี' },
    owner: 'ระบบเฝ้าระวังระดับน้ำ นนทบุรี',
    url: 'https://cctv-nont.firsttech.co.th/',
    embedUrl: 'https://cctv-nont.firsttech.co.th/',
    kind: 'water',
  },
  {
    id: 'water-pakkret-pier',
    name: 'ท่าน้ำปากเกร็ด',
    road: 'แม่น้ำเจ้าพระยา',
    location: { lat: 13.9126, lng: 100.4985, province: '12', provinceName: 'นนทบุรี' },
    owner: 'รายงานระดับน้ำท่าน้ำปากเกร็ด',
    // หน้าเว็บเป็น http จึงฝังในแอป (https) ไม่ได้ — เปิดดูในเว็บต้นทาง
    url: 'http://www.thaiclouderp.com/video/pakkret_water_report.html',
    kind: 'water',
  },
  {
    id: 'water-bma-mahasawat',
    name: 'คลองมหาสวัสดิ์ (สะพานรวมใจ ตลิ่งชัน-บางกรวย)',
    road: 'คลองมหาสวัสดิ์ ใกล้สะพาน Fast Track',
    location: { lat: 13.79965, lng: 100.43863, province: '10', provinceName: 'กรุงเทพมหานคร' },
    owner: 'สำนักการระบายน้ำ กทม.',
    // เว็บ กทม. เปิดได้เฉพาะจากในประเทศไทย
    url: 'https://weather.bangkok.go.th/water/StationDetail?id=73',
    embedUrl: 'https://weather.bangkok.go.th/water/StationDetail?id=73',
    // ข้ามเมนู ชื่อสถานี และลิงก์สถานีก่อน/ถัดไป ให้กรอบเริ่มที่ภาพระดับน้ำ (วัดจากจอมือถือ)
    embedCropTop: 330,
    kind: 'water',
  },
];
