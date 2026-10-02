/** ตัวอย่างข้อมูลจากต้นทาง (ย่อจากของจริง ก.ย. 2569) */

const cam = (name: string) =>
  `http://182.52.224.70/MilestoneImageService/ImageService.svc/ImageService/GetImage?width=800&height=450&ondate=2026-09-28 14:43&cameraname=${name}`;

export const NONT_BODY = {
  results: 'Success',
  station: [
    {
      id: 'STN2',
      code: 'A2',
      name: 'วัดตำหนักใต้',
      address: 'ชื่อผู้ดูแล',
      cctv: [cam('A2-วัดตำหนักใต้ Cam1'), cam('A2-วัดตำหนักใต้ Cam2')],
      location: { lat: 13.886683, lng: 100.488564 },
      data: {
        rf: { enable: true, value: { now: 0, day: 43.8, warning: 30, danger: 90 } },
        wl_up: { enable: true, value: { now: 1.12, warning: 1.5, danger: 2 } },
        wl_down: { enable: true, value: { now: 1.84, warning: 1.5, danger: 2.5 } },
      },
      date: '2026-09-28 14:30',
    },
    {
      id: 'STN1',
      code: 'A1',
      name: 'คลองท่าทราย',
      cctv: [cam('A1-คลองท่าทราย Cam1')],
      location: { lat: 13.889283, lng: 100.490387 },
      data: { wl_up: { enable: true, value: { now: 0.07, warning: 1.5, danger: 2 } } },
      date: '2023-05-30 17:45',
    },
    { id: 'STN27', code: 'C1', name: 'ไม่มีกล้อง', cctv: [], location: { lat: 13.84, lng: 100.49 }, data: {}, date: '2026-09-28 14:40' },
    {
      id: 'STN30',
      code: 'C4',
      name: 'ถ.ติวานนท์ ฝั่งสถาบันโรคทรวงอก',
      cctv: [],
      location: { lat: 13.860908, lng: 100.521418 },
      data: { wl_up: { enable: true, value: { now: 0.27, warning: 0.2, danger: 0.4 } }, wl_down: { enable: false, value: null } },
      date: '2026-09-28 14:40',
    },
    { id: 'STN16', code: 'B1', name: 'ไม่มีกล้องและค่าเก่า', cctv: [], location: { lat: 13.87, lng: 100.52 }, data: {}, date: '2019-01-15 15:00' },
    { id: 'STN99', code: 'Z9', name: 'พิกัดผิด', cctv: [cam('Z9-x Cam1')], location: { lat: 0, lng: 0 }, data: {}, date: '' },
  ],
};

export const PAKKRET_HTML = `<html><body>
<img src="../snapshots/192.168.21.66/192.168.21.66.jpg?T=949038" class="w-full h-auto object-cover snapshot-image" alt="Snapshot">
<canvas thresholds='{&quot;red&quot;:[],&quot;redText&quot;:[{&quot;text&quot;:&quot;ระดับน้ำสูงสุดปี 54&quot;,&quot;x&quot;:857,&quot;y&quot;:54},{&quot;text&quot;:&quot;3.38 เมตร&quot;,&quot;x&quot;:859,&quot;y&quot;:105},{&quot;text&quot;:&quot;ระดับน้ำสูงสุดปี 65&quot;,&quot;x&quot;:866,&quot;y&quot;:231},{&quot;text&quot;:&quot;2.84 เมตร&quot;,&quot;x&quot;:870,&quot;y&quot;:280}]}'></canvas>
<script>
  const sensorData = [{"sensor_id":"001","location_name":"Water Sensor 1","latitude":"13.915300","longitude":"100.494700","snapshot":"http:\\/\\/water.eon-solution.com\\/x.jpg","log_datetime":"2026-09-28 14:45:05.000","water_level":"1.90","status_color":"yellow","status_label":"เฝ้าระวัง"}];
</script></body></html>`;

/** ย่อจาก https://app.streambridge.online/api/public/bangkruai-city (ต.ค. 2569) */
export const STREAMBRIDGE_BODY = {
  slug: 'bangkruai-city',
  title: 'BangKruai City : เทศบาลเมืองบางกรวย',
  subtitle: 'เทศบาลเมืองบางกรวย',
  cameras: [
    {
      id: '4aac4b3e-b18a-49a3-903b-e3ad9f960a44',
      name: 'แยกเทิดพระเกียรติ กล้อง 1',
      status: 'online',
      latitude: 13.80272,
      longitude: 100.47725,
      hlsUrl: null,
      thumbnail: 'https://app.streambridge.online/snapshots/4aac4b3e-b18a-49a3-903b-e3ad9f960a44.jpg?v=1790860181887',
    },
    { id: 'off', name: 'กล้องออฟไลน์', status: 'offline', latitude: 13.8, longitude: 100.48, thumbnail: null },
    { id: 'nopos', name: 'ไม่มีพิกัด', status: 'online', latitude: null, longitude: null },
    { id: 'evil', name: 'ภาพจากโดเมนอื่น', status: 'online', latitude: 13.81, longitude: 100.5, thumbnail: 'https://evil.example/x.jpg' },
  ],
};
