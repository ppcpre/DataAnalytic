import type { CameraLink } from '@flood-watch/shared';

/**
 * ลิงก์ไปดูกล้อง CCTV / รายงานน้ำท่วมของหน่วยงานโดยตรง (ไม่ได้นำภาพมาแสดงซ้ำในแอป)
 * ตรวจสอบ URL เป็นระยะ เพราะหน่วยงานอาจย้ายที่อยู่เว็บไซต์
 */
export const CAMERA_LINKS: CameraLink[] = [
  {
    id: 'longdo-traffic',
    name: 'กล้อง CCTV ทุกจุด (Longdo Traffic)',
    description: 'ภาพสดกล้องของ กทม. และกรมทางหลวงผ่านมูลนิธิ iTIC — แตะหมุดกล้องบนแผนที่เพื่อเปิดดูกล้องตัวนั้นได้เลย',
    url: 'https://traffic.longdo.com/camera',
    area: 'กทม. และปริมณฑล',
  },
  {
    id: 'bma-traffic',
    name: 'กล้อง CCTV กรุงเทพมหานคร (BMA Traffic)',
    description: 'ระบบกล้องของ กทม. — ถ้าเปิดแล้วขึ้นหน้าตรวจสอบหรือโหลดไม่ได้ ให้ใช้ Longdo Traffic แทน',
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
    id: 'pakkret-traffic',
    name: 'กล้อง CCTV จราจร ปากเกร็ด',
    description: 'กล้องจราจรในพื้นที่เทศบาลนครปากเกร็ด — เว็บเปิดได้เฉพาะจากในประเทศไทย',
    url: 'https://www.thaiclouderp.com/CCTV_MONITOR/web/pakkred',
    area: 'นนทบุรี',
  },
  {
    id: 'nont-flood-center',
    name: 'ศูนย์ป้องกันน้ำท่วม เทศบาลนครนนทบุรี',
    description: 'ภาพกล้องและระดับน้ำตามคลองในเขตเทศบาลนครนนทบุรี (แสดงเป็นหมุดบนแผนที่ด้วย)',
    url: 'http://182.52.224.70/?page=cctv',
    area: 'นนทบุรี',
  },
  {
    id: 'dwr-telemetry-cctv',
    name: 'กล้องสถานีโทรมาตร กรมทรัพยากรน้ำ',
    description: 'ภาพสดและระดับน้ำตามแม่น้ำสายหลักทั่วประเทศ เช่น เจ้าพระยา ท่าจีน บางปะกง (จุดในพื้นที่แสดงเป็นหมุดบนแผนที่ด้วย)',
    url: 'https://telemetry.dwr.go.th/reportCctv',
    area: 'ทั่วประเทศ',
  },
  {
    id: 'rangsit-flood-watch',
    name: 'ระบบติดตามน้ำท่วม เทศบาลนครรังสิต',
    description: 'กล้องจุดเฝ้าระวัง ระดับเตือนภัย และจุดน้ำท่วมที่ประชาชนแจ้ง (แสดงเป็นหมุดบนแผนที่ด้วย)',
    url: 'https://cdp.rangsitcity.go.th/',
    area: 'ปทุมธานี',
  },
  {
    id: 'doh-hdms',
    name: 'กรมทางหลวง (HDMS Dashboard)',
    description: 'กล้อง CCTV และพิกัดจุดน้ำท่วมบนทางหลวงทั่วประเทศ',
    url: 'https://hdms.doh.go.th/dashboard',
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
