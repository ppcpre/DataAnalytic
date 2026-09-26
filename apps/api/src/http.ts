export class UpstreamError extends Error {
  constructor(
    message: string,
    public readonly url: string,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

export async function fetchJson(url: string, timeoutMs = 15000): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'flood-watch-pwa/0.1' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new UpstreamError(`เชื่อมต่อต้นทางไม่สำเร็จ: ${(err as Error).message}`, url);
  }
  if (!res.ok) throw new UpstreamError(`ต้นทางตอบกลับ HTTP ${res.status}`, url);
  try {
    return await res.json();
  } catch {
    throw new UpstreamError('ต้นทางไม่ได้ส่งข้อมูลรูปแบบ JSON', url);
  }
}
