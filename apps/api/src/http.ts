export class UpstreamError extends Error {
  constructor(
    message: string,
    public readonly url: string,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

export async function fetchJson(url: string, timeoutMs = 15000, init: RequestInit = {}): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        accept: 'application/json',
        'user-agent': 'flood-watch-pwa/0.1',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new UpstreamError(`เชื่อมต่อต้นทางไม่สำเร็จ: ${(err as Error).message}`, url.split('?')[0]);
  }
  // ไม่ใส่ query string ใน error เพื่อไม่ให้ API key หลุดไปใน log
  const safeUrl = url.split('?')[0];
  if (!res.ok) throw new UpstreamError(`ต้นทางตอบกลับ HTTP ${res.status}`, safeUrl);
  try {
    return await res.json();
  } catch {
    throw new UpstreamError('ต้นทางไม่ได้ส่งข้อมูลรูปแบบ JSON', safeUrl);
  }
}

export function postJson(url: string, body: unknown, timeoutMs = 20000): Promise<unknown> {
  return fetchJson(url, timeoutMs, { method: 'POST', body: JSON.stringify(body) });
}

export async function fetchText(url: string, timeoutMs = 20000): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 PreMonitoring', 'accept-language': 'th' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new UpstreamError(`เชื่อมต่อต้นทางไม่สำเร็จ: ${(err as Error).message}`, url.split('?')[0]);
  }
  if (!res.ok) throw new UpstreamError(`ต้นทางตอบกลับ HTTP ${res.status}`, url.split('?')[0]);
  return res.text();
}
