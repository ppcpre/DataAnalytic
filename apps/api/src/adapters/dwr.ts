/**
 * กล้อง CCTV ที่สถานีโทรมาตรของกรมทรัพยากรน้ำ (https://telemetry.dwr.go.th/reportCctv)
 * - รายชื่อสถานีที่มีกล้อง: POST /api/public/reportCctv/listPaginate
 * - รายละเอียดสถานี (พิกัด ระดับน้ำ เกณฑ์เตือนภัย ภาพล่าสุด): GET /api/public/station/getByCode/<code>
 * - ภาพสด MJPEG: /cctv/mjpeg/<code> (แสดงใน <img> ได้ตรง ๆ)
 * - ภาพนิ่งล่าสุด (ทุก ~15 นาที): POST /api/file/image/cctv { path } — ต้องผ่าน /api/dwr/image เพราะ <img> ส่ง POST ไม่ได้
 */
import { CAMERA_ONLY_PROVINCES, PROVINCES, type Camera, type CameraReading } from '@flood-watch/shared';

type Rec = Record<string, unknown>;

export const DWR_BASE = 'https://telemetry.dwr.go.th';
export const DWR_LIST_URL = `${DWR_BASE}/api/public/reportCctv/listPaginate`;
export const DWR_LIST_BODY = { paginate: { page: 1, pageSize: 500, orders: [{ key: 'MAIN_BASIN', desc: false }] }, search: {} };
export const DWR_IMAGE_URL = `${DWR_BASE}/api/file/image/cctv`;
export const dwrStationUrl = (code: string) => `${DWR_BASE}/api/public/station/getByCode/${code}`;
/** รหัสสถานี เช่น TA100220 */
export const DWR_CODE = /^[A-Z]{2}\d{6}$/;
/** path ของภาพล่าสุด เช่น /TA100220/2026/10/10/7_30.jpg */
export const DWR_SNAPSHOT_PATH = /^\/[A-Z]{2}\d{6}\/\d{4}\/\d{2}\/\d{2}\/\d{1,2}_\d{1,2}\.jpg$/;
const OWNER = 'กรมทรัพยากรน้ำ';

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const iso = (v: unknown) => {
  const d = str(v) ? new Date(str(v)!) : undefined;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : undefined;
};

/** ชื่อจังหวัด (ไทย) → รหัส สำหรับจังหวัดที่แอปแสดงกล้อง */
const PROVINCE_CODE: Record<string, string> = Object.fromEntries(
  Object.entries({ ...PROVINCES, ...CAMERA_ONLY_PROVINCES }).map(([code, name]) => [name, code]),
);

export interface DwrListItem {
  code: string;
  name: string;
  province: string;
  provinceName: string;
  district?: string;
}

/** รายชื่อสถานีที่มีกล้องและเปิดใช้งาน เฉพาะจังหวัดที่แอปแสดงกล้อง */
export function parseDwrList(body: unknown): DwrListItem[] {
  const results = ((body as Rec | null)?.value as Rec | null)?.results;
  if (!Array.isArray(results)) return [];
  const out: DwrListItem[] = [];
  for (const r of results as Rec[]) {
    const e = (r.entity ?? {}) as Rec;
    const code = str(e.stationCode);
    const name = str(e.stnNameTh);
    const provinceName = str(r.provinceNameTh);
    const province = provinceName ? PROVINCE_CODE[provinceName] : undefined;
    if (!code || !DWR_CODE.test(code) || !name || !province || e.cctvOnline === false) continue;
    out.push({ code, name, province, provinceName: provinceName!, district: str(r.districtNameTh) });
  }
  return out;
}

/** สถานีหนึ่งแห่ง → กล้อง (ภาพสด + ภาพนิ่ง + ระดับน้ำ) */
export function parseDwrStation(item: DwrListItem, body: unknown): Camera | undefined {
  const v = ((body as Rec | null)?.value ?? null) as Rec | null;
  const e = ((v?.fullCon as Rec | null)?.entity ?? null) as Rec | null;
  const point = (e?.point ?? null) as Rec | null;
  const lat = num(point?.lat);
  const lng = num(point?.lon);
  if (!e || lat === undefined || lng === undefined || str(e.stationCode) !== item.code) return undefined;
  if (lat < 5 || lat > 21 || lng < 97 || lng > 106) return undefined;
  const cur = (v?.stationCurrentData ?? null) as Rec | null;
  const wl = num(cur?.wl);
  const observedAt = iso(cur?.wlTimeStamp) ?? iso(cur?.timeStamp);
  const readings: CameraReading[] =
    wl !== undefined && e.wlEnabled !== false
      ? [
          {
            label: 'ระดับน้ำ (ม.รทก.)',
            value: wl,
            unit: 'ม.',
            ...(num(e.wlFw) !== undefined ? { warning: num(e.wlFw) } : {}),
            ...(num(e.wlFc) !== undefined ? { danger: num(e.wlFc) } : {}),
            historyId: `dwr-${item.code}`,
          },
        ]
      : [];
  const stream = str(e.stream);
  return {
    id: `dwr-${item.code}`,
    name: item.name,
    road: [stream, item.district].filter(Boolean).join(' · ') || 'สถานีโทรมาตร',
    location: { lat, lng, province: item.province, provinceName: item.provinceName },
    owner: OWNER,
    url: `${DWR_BASE}/station/${item.code}`,
    streamUrl: `${DWR_BASE}/cctv/mjpeg/${item.code}`,
    imageUrl: `/api/dwr/image?code=${item.code}`,
    imageCredit: OWNER,
    kind: 'water',
    ...(readings.length ? { readings, observedAt } : {}),
  };
}

/** path ภาพล่าสุดของสถานี จาก getByCode */
export function dwrSnapshotPath(body: unknown): string | undefined {
  const e = ((((body as Rec | null)?.value as Rec | null)?.fullCon as Rec | null)?.entity ?? null) as Rec | null;
  const p = str(e?.cctvLatestSnapshotPath);
  return p && DWR_SNAPSHOT_PATH.test(p) ? p : undefined;
}
