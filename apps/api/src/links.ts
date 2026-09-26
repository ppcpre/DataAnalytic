import type { CameraLink } from '@flood-watch/shared';

/**
 * ลิงก์ไปดูกล้อง CCTV ของหน่วยงานโดยตรง (ไม่ได้นำภาพมาแสดงซ้ำในแอป)
 * ตรวจสอบ URL เป็นระยะ เพราะหน่วยงานอาจย้ายที่อยู่เว็บไซต์
 */
export const CAMERA_LINKS: CameraLink[] = [
  {
    id: 'bma-traffic',
    name: 'กล้อง CCTV กรุงเทพมหานคร',
    description: 'ภาพจากกล้องวงจรปิดตามถนนสายหลักของ กทม. (BMA Traffic)',
    url: 'http://www.bmatraffic.com/',
  },
  {
    id: 'longdo-traffic',
    name: 'Longdo Traffic',
    description: 'ภาพกล้องจราจรในกรุงเทพฯ และปริมณฑลจากหลายหน่วยงาน',
    url: 'https://traffic.longdo.com/',
  },
];

/** ลิงก์แหล่งข้อมูลทางการที่ผู้ใช้ควรตรวจสอบประกอบ */
export const OFFICIAL_LINKS: CameraLink[] = [
  {
    id: 'thaiwater',
    name: 'คลังข้อมูลน้ำแห่งชาติ (ThaiWater)',
    description: 'ระดับน้ำ ฝน และประตูระบายน้ำทั่วประเทศ',
    url: 'https://www.thaiwater.net/',
  },
  {
    id: 'bma-dds',
    name: 'สำนักการระบายน้ำ กทม.',
    description: 'สถานการณ์น้ำ ระดับน้ำในคลอง และการระบายน้ำในกรุงเทพฯ',
    url: 'https://dds.bangkok.go.th/',
  },
  {
    id: 'bma-weather',
    name: 'เรดาร์ฝน กทม.',
    description: 'ภาพเรดาร์และปริมาณฝนในกรุงเทพฯ',
    url: 'https://weather.bangkok.go.th/',
  },
  {
    id: 'gistda-flood',
    name: 'GISTDA ติดตามพื้นที่น้ำท่วม',
    description: 'แผนที่พื้นที่น้ำท่วมจากภาพถ่ายดาวเทียม',
    url: 'https://flood.gistda.or.th/',
  },
];
