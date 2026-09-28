/** ชนิดของ TCP socket ใน Cloudflare Workers (เฉพาะส่วนที่ใช้) */
declare module 'cloudflare:sockets' {
  export function connect(address: { hostname: string; port: number }): {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    close(): Promise<void>;
  };
}
