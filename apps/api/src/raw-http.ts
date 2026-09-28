/**
 * HTTP/1.1 GET แบบง่ายผ่าน TCP socket
 * ใช้กับเซิร์ฟเวอร์ของเทศบาลนครนนทบุรีที่มีแต่ IP — Cloudflare Workers ใช้ fetch() กับ URL ที่เป็น IP ไม่ได้ (error 1003)
 * แต่เปิด TCP socket ไปที่ IP ได้ (cloudflare:sockets)
 */

export interface RawResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
}

/** socket แบบ readable/writable stream (รูปแบบเดียวกับ cloudflare:sockets) */
export interface StreamSocket {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close(): Promise<void>;
}

export type SocketConnect = (address: { hostname: string; port: number }) => StreamSocket;

/** ขนาดคำตอบสูงสุด (ภาพกล้อง ~70 KB, รายชื่อสถานี ~40 KB) */
const MAX_BYTES = 2 * 1024 * 1024;

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

function indexOf(buf: Uint8Array, seq: number[], from = 0): number {
  outer: for (let i = from; i <= buf.length - seq.length; i++) {
    for (let j = 0; j < seq.length; j++) if (buf[i + j] !== seq[j]) continue outer;
    return i;
  }
  return -1;
}

const CRLF = [13, 10];
const latin1 = (b: Uint8Array) => String.fromCharCode(...b);

function dechunk(body: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let total = 0;
  let at = 0;
  while (at < body.length) {
    const eol = indexOf(body, CRLF, at);
    if (eol < 0) throw new Error('chunked body ไม่สมบูรณ์');
    const size = parseInt(latin1(body.subarray(at, eol)).split(';')[0].trim(), 16);
    if (!Number.isFinite(size)) throw new Error('chunk size ไม่ถูกต้อง');
    if (size === 0) break;
    const start = eol + 2;
    if (start + size > body.length) throw new Error('chunked body ไม่สมบูรณ์');
    parts.push(body.subarray(start, start + size));
    total += size;
    at = start + size + 2;
  }
  return concat(parts, total);
}

/** แยกคำตอบ HTTP ทั้งก้อน (สถานะ, header, body) */
export function parseHttpResponse(raw: Uint8Array): RawResponse {
  const end = indexOf(raw, [13, 10, 13, 10]);
  if (end < 0) throw new Error('ไม่พบ header ของคำตอบ HTTP');
  const [statusLine, ...lines] = latin1(raw.subarray(0, end)).split('\r\n');
  const status = Number(/^HTTP\/1\.[01] (\d{3})/.exec(statusLine)?.[1]);
  if (!status) throw new Error('บรรทัดสถานะ HTTP ไม่ถูกต้อง');
  const headers: Record<string, string> = {};
  for (const line of lines) {
    const i = line.indexOf(':');
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  let body = raw.subarray(end + 4);
  if (/chunked/i.test(headers['transfer-encoding'] ?? '')) body = dechunk(body);
  else if (headers['content-length'] !== undefined) {
    const len = Number(headers['content-length']);
    if (Number.isFinite(len) && len < body.length) body = body.subarray(0, len);
  }
  return { status, headers, body };
}

/**
 * GET ผ่าน socket — ส่งคำขอแบบ Connection: close แล้วอ่านจนเซิร์ฟเวอร์ปิดการเชื่อมต่อ
 * path ต้องขึ้นต้นด้วย / และไม่มีอักขระขึ้นบรรทัดใหม่ (กันการแทรก header)
 */
export async function rawGet(
  connect: SocketConnect,
  hostname: string,
  path: string,
  { port = 80, timeoutMs = 15000 } = {},
): Promise<RawResponse> {
  if (!path.startsWith('/') || /[\s]/.test(path)) throw new Error('path ไม่ถูกต้อง');
  const socket = connect({ hostname, port });
  const timer = setTimeout(() => void socket.close().catch(() => {}), timeoutMs);
  try {
    const writer = socket.writable.getWriter();
    await writer.write(
      new TextEncoder().encode(
        `GET ${path} HTTP/1.1\r\nHost: ${hostname}\r\nUser-Agent: Mozilla/5.0 PreMonitoring\r\nAccept: */*\r\nConnection: close\r\n\r\n`,
      ),
    );
    writer.releaseLock();
    const reader = socket.readable.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
      if (total > MAX_BYTES) throw new Error('คำตอบใหญ่เกินกำหนด');
    }
    return parseHttpResponse(concat(chunks, total));
  } finally {
    clearTimeout(timer);
    await socket.close().catch(() => {});
  }
}
