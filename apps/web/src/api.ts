import type {
  ApiResponse,
  Camera,
  HistoryPoint,
  Place,
  CameraLink,
  FloodForecast,
  Floodgate,
  RainStation,
  WaterLevelStation,
} from '@flood-watch/shared';

/** URL ของ API (ว่าง = origin เดียวกัน / ผ่าน proxy ของ Vite ตอนพัฒนา) */
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { signal });
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
  history: (id: string, hours = 24) =>
    getJson<{ data: HistoryPoint[]; sample: boolean }>(`/api/history/${encodeURIComponent(id)}?hours=${hours}`),
  cameras: () => getJson<ApiResponse<Camera>>('/api/cameras'),
  geocode: (q: string, signal?: AbortSignal) =>
    getJson<{ data: Place[] }>(`/api/geocode?q=${encodeURIComponent(q)}`, signal),
  health: () =>
    getJson<{ ok: boolean; dataMode: string; floodhub: boolean; floodgates: boolean; cameras: boolean; geocode: boolean }>(
      '/api/health',
    ),
  links: () => getJson<{ cameras: CameraLink[]; official: CameraLink[] }>('/api/links'),
};
