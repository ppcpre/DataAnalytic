import { describe, expect, it } from 'vitest';
import { parseHttpResponse, rawGet, type SocketConnect } from '../src/raw-http.js';

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

/** socket จำลอง: เก็บคำขอที่เขียน แล้วส่งคำตอบเป็นหลายก้อน */
function fakeConnect(chunks: string[]) {
  const sent: string[] = [];
  const targets: Array<{ hostname: string; port: number }> = [];
  const connect: SocketConnect = (address) => {
    targets.push(address);
    return {
      readable: new ReadableStream({
        start(c) {
          for (const x of chunks) c.enqueue(enc(x));
          c.close();
        },
      }),
      writable: new WritableStream({ write: (b) => void sent.push(dec(b)) }),
      close: async () => {},
    };
  };
  return { connect, sent, targets };
}

describe('raw http over a socket', () => {
  it('sends a plain GET and reads a content-length body split across reads', async () => {
    const { connect, sent, targets } = fakeConnect(['HTTP/1.1 200 OK\r\nContent-Type: image/jpeg\r\nContent-Len', 'gth: 4\r\n\r\nab', 'cd']);
    const res = await rawGet(connect, '182.52.224.70', '/x?a=1');
    expect(targets).toEqual([{ hostname: '182.52.224.70', port: 80 }]);
    expect(sent.join('')).toBe(
      'GET /x?a=1 HTTP/1.1\r\nHost: 182.52.224.70\r\nUser-Agent: Mozilla/5.0 PreMonitoring\r\nAccept: */*\r\nConnection: close\r\n\r\n',
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(dec(res.body)).toBe('abcd');
  });

  it('decodes chunked bodies', () => {
    const res = parseHttpResponse(enc('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n6;x=1\r\n world\r\n0\r\n\r\n'));
    expect(dec(res.body)).toBe('hello world');
  });

  it('rejects paths that could inject headers and broken responses', async () => {
    const { connect } = fakeConnect([]);
    await expect(rawGet(connect, 'h', '/a b')).rejects.toThrow();
    await expect(rawGet(connect, 'h', '/a\r\nX: y')).rejects.toThrow();
    await expect(rawGet(connect, 'h', 'http://evil/')).rejects.toThrow();
    expect(() => parseHttpResponse(enc('garbage'))).toThrow();
  });
});
