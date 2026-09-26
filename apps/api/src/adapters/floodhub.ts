/**
 * Adapter สำหรับ Google Flood Forecasting API (ข้อมูลเบื้องหลัง Google Flood Hub)
 * https://developers.google.com/flood-forecasting
 *
 * - ใช้ฟรี แต่ต้องสมัครเข้าร่วม (waitlist) และใช้ API key ของ Google Cloud project ที่ได้รับอนุมัติ
 * - ดึงสถานะล่าสุดทั้งประเทศ (regionCode=TH) แล้วกรองเฉพาะกรอบพื้นที่ที่สนใจ
 */
import type { FloodForecast, FloodHubSeverity, Status } from '@flood-watch/shared';

type Rec = Record<string, unknown>;

export interface BBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

const SEVERITIES: FloodHubSeverity[] = ['EXTREME', 'SEVERE', 'ABOVE_NORMAL', 'NO_FLOODING', 'UNKNOWN'];

const SEVERITY_STATUS: Record<FloodHubSeverity, Status> = {
  EXTREME: 'critical',
  SEVERE: 'warning',
  ABOVE_NORMAL: 'watch',
  NO_FLOODING: 'normal',
  UNKNOWN: 'unknown',
};

function severity(v: unknown): FloodHubSeverity {
  const s = typeof v === 'string' ? v.toUpperCase() : '';
  return (SEVERITIES as string[]).includes(s) ? (s as FloodHubSeverity) : 'UNKNOWN';
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}

function inBox(lat: number, lng: number, b: BBox): boolean {
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

export function parseFloodStatuses(pages: unknown[], bbox: BBox): FloodForecast[] {
  const out: FloodForecast[] = [];
  for (const page of pages) {
    const list = (page as Rec | null)?.floodStatuses;
    if (!Array.isArray(list)) continue;
    for (const r of list as Rec[]) {
      const loc = (r.gaugeLocation ?? {}) as Rec;
      const lat = Number(loc.latitude);
      const lng = Number(loc.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inBox(lat, lng, bbox)) continue;
      const sev = severity(r.severity);
      const range = (r.forecastTimeRange ?? {}) as Rec;
      out.push({
        id: `gfh-${String(r.gaugeId ?? `${lat},${lng}`)}`,
        location: { lat, lng, province: '' },
        severity: sev,
        status: SEVERITY_STATUS[sev],
        trend: str(r.forecastTrend),
        issuedAt: str(r.issuedTime),
        forecastStart: str(range.start),
        forecastEnd: str(range.end),
      });
    }
  }
  return out;
}

type PostJson = (url: string, body: unknown) => Promise<unknown>;

/** ดึงทุกหน้า (จำกัดจำนวนหน้าเพื่อกันลูปไม่รู้จบ) */
export async function fetchFloodStatusPages(
  baseUrl: string,
  apiKey: string,
  regionCode: string,
  post: PostJson,
  maxPages = 20,
): Promise<unknown[]> {
  const url = `${baseUrl}/v1/floodStatus:searchLatestFloodStatusByArea?key=${encodeURIComponent(apiKey)}`;
  const pages: unknown[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const page = (await post(url, { regionCode, pageSize: 500, ...(pageToken ? { pageToken } : {}) })) as Rec;
    pages.push(page);
    pageToken = typeof page?.nextPageToken === 'string' && page.nextPageToken ? page.nextPageToken : undefined;
    if (!pageToken) break;
  }
  return pages;
}
