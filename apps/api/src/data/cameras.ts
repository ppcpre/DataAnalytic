import type { Camera } from '@flood-watch/shared';

/**
 * รายชื่อกล้อง CCTV ที่แสดงเป็นหมุดบนแผนที่
 *
 * ยังไม่พบแหล่งข้อมูลสาธารณะที่ให้พิกัดกล้องได้ จึงเริ่มจากรายการว่าง
 * เพิ่มกล้องได้โดยใส่ข้อมูลที่ตรวจสอบพิกัดแล้ว เช่น
 *
 *   {
 *     id: 'bma-001',
 *     name: 'แยก...',
 *     road: 'ถนน...',
 *     location: { lat: 13.75, lng: 100.54, province: '10' },
 *     owner: 'กทม.',
 *     url: 'https://cpudapp.bangkok.go.th/bmatraffic',
 *   },
 */
export const CAMERAS: Camera[] = [];
