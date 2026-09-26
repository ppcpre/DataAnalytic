import type { CameraLink } from '@flood-watch/shared';

/**
 * ลิงก์ไปดูกล้อง CCTV / รายงานน้ำท่วมของหน่วยงานโดยตรง (ไม่ได้นำภาพมาแสดงซ้ำในแอป)
 * ตรวจสอบ URL เป็นระยะ เพราะหน่วยงานอาจย้ายที่อยู่เว็บไซต์
 */
export const CAMERA_LINKS: CameraLink[] = [
  {
    id: 'bma-traffic',
    name: 'กล้อง CCTV กรุงเทพมหานคร (BMA Traffic)',
    description: 'ดูภาพกล้องวงจรปิดตามถนนใน กทม. ก่อนออกเดินทาง',
    url: 'https://cpudapp.bangkok.go.th/bmatraffic',
    area: 'กทม.',
  },
  {
    id: 'bma-road-flood',
    name: 'น้ำท่วมถนน กทม.',
    description: 'ระดับน้ำขังบนถนนจากเซนเซอร์ของ กทม.',
    url: 'https://weather.bangkok.go.th/flood',
    area: 'กทม.',
  },
  {
    id: 'doh-hdms',
    name: 'กรมทางหลวง (HDMS Dashboard)',
    description: 'กล้อง CCTV และพิกัดจุดน้ำท่วมบนทางหลวงทั่วประเทศ',
    url: 'https://hdms.doh.go.th/dashboard',
  },
  {
    id: 'longdo-traffic',
    name: 'Longdo Traffic',
    description: 'รวมภาพกล้องจราจรและสภาพการจราจรจากหลายหน่วยงาน',
    url: 'https://traffic.longdo.com/',
  },
];

/** เครื่องมือ/แหล่งข้อมูลที่ควรใช้ประกอบ */
export const OFFICIAL_LINKS: CameraLink[] = [
  {
    id: 'thaiwater-new4all',
    name: 'ThaiWater — One Map น้ำของภาครัฐ',
    description:
      'ปริมาณน้ำในเขื่อน อัตราการระบายน้ำ และระดับน้ำตามสถานีสำคัญ ใช้ประเมินว่าน้ำจะมาถึงพื้นที่ท้ายน้ำเมื่อไร',
    url: 'https://www.thaiwater.net/new4all',
  },
  {
    id: 'google-flood-hub',
    name: 'Google Flood Hub',
    description: 'พยากรณ์น้ำล้นตลิ่งตามลุ่มน้ำล่วงหน้าหลายวัน อ่านง่าย',
    url: 'https://sites.research.google/floods',
  },
  {
    id: 'bma-dds',
    name: 'สำนักการระบายน้ำ กทม.',
    description: 'สถานการณ์น้ำ ระดับน้ำในคลอง และการระบายน้ำในกรุงเทพฯ',
    url: 'https://dds.bangkok.go.th/',
    area: 'กทม.',
  },
  {
    id: 'gistda-flood',
    name: 'GISTDA ติดตามพื้นที่น้ำท่วม',
    description: 'แผนที่พื้นที่น้ำท่วมจากภาพถ่ายดาวเทียม',
    url: 'https://flood.gistda.or.th/',
  },
];
