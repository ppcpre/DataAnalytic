import type {
  ApiResponse,
  CameraLink,
  FloodForecast,
  Floodgate,
  RainStation,
  WaterLevelStation,
} from '@flood-watch/shared';

/** URL ของ API (ว่าง = origin เดียวกัน / ผ่าน proxy ของ Vite ตอนพัฒนา) */
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export const api = {
  waterLevel: () => getJson<ApiResponse<WaterLevelStation>>('/api/water-level'),
  rain: () => getJson<ApiResponse<RainStation>>('/api/rain'),
  floodgates: () => getJson<ApiResponse<Floodgate>>('/api/floodgates'),
  keyStations: () => getJson<ApiResponse<WaterLevelStation>>('/api/key-stations'),
  floodForecast: () => getJson<ApiResponse<FloodForecast>>('/api/flood-forecast'),
  health: () => getJson<{ ok: boolean; dataMode: string; floodhub: boolean; floodgates: boolean }>('/api/health'),
  links: () => getJson<{ cameras: CameraLink[]; official: CameraLink[] }>('/api/links'),
};
