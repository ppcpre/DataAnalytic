/**
 * Entry สำหรับ Cloudflare Workers — ใช้ Hono app ตัวเดียวกับ Node.js
 * ไฟล์หน้าเว็บ (apps/web/dist) ถูกเสิร์ฟโดย Workers Static Assets ส่วน /api/* มาที่นี่
 */
import { connect } from 'cloudflare:sockets';
import { createApp } from './app.js';
import { NONT_HOST } from './adapters/nonthaburi.js';
import { rawGet } from './raw-http.js';
import { loadConfig, type Env } from './config.js';
import { D1HistoryStore, MemoryHistoryStore, RETENTION_MS, type D1Like, type HistoryStore } from './history.js';

interface WorkerEnv {
  /** ฐานข้อมูล D1 สำหรับเก็บข้อมูลย้อนหลัง (ไม่บังคับ — ไม่มีจะเก็บในหน่วยความจำชั่วคราว) */
  DB?: D1Like;
  [key: string]: unknown;
}

interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}

let app: ReturnType<typeof createApp> | null = null;
let history: HistoryStore | null = null;

function init(env: WorkerEnv) {
  // สร้างครั้งเดียวต่อ isolate เพื่อให้ cache ในหน่วยความจำใช้ร่วมกันระหว่างคำขอ
  history ??= env.DB ? new D1HistoryStore(env.DB) : new MemoryHistoryStore();
  app ??= createApp(loadConfig(env as Env), undefined, undefined, {
    history,
    // เซิร์ฟเวอร์ของเทศบาลนครนนทบุรีมีแต่ IP ซึ่ง fetch() บน Workers เรียกไม่ได้ จึงต่อผ่าน TCP socket (เฉพาะเครื่องนี้)
    nontGet: (path) => rawGet(connect, NONT_HOST, path),
  });
  return { app, history };
}

export default {
  fetch(request: Request, env: WorkerEnv, ctx: Ctx) {
    return init(env).app.fetch(request, env, ctx as never);
  },

  /** Cron Trigger: ดึงข้อมูลเป็นระยะเพื่อเก็บประวัติ แม้ไม่มีผู้ใช้เปิดแอป */
  async scheduled(_event: unknown, env: WorkerEnv, ctx: Ctx) {
    const { app, history } = init(env);
    const run = async () => {
      // /api/cameras ดึงข้อมูลนนทบุรีและเก็บประวัติระดับน้ำประตูน้ำ/น้ำท่วมถนน
      for (const path of ['/api/water-level', '/api/key-stations', '/api/cameras']) {
        const res = await app.fetch(new Request(`https://internal${path}`), env, ctx as never);
        if (!res.ok) console.error('[cron]', path, res.status);
      }
      await history.prune(Date.now() - RETENTION_MS);
    };
    ctx.waitUntil(run());
  },
};
