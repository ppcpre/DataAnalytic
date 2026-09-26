/**
 * Entry สำหรับ Cloudflare Workers — ใช้ Hono app ตัวเดียวกับ Node.js
 * ไฟล์หน้าเว็บ (apps/web/dist) ถูกเสิร์ฟโดย Workers Static Assets ส่วน /api/* มาที่นี่
 */
import { createApp } from './app.js';
import { loadConfig, type Env } from './config.js';

let app: ReturnType<typeof createApp> | null = null;

export default {
  fetch(request: Request, env: Env, ctx: unknown) {
    // สร้างครั้งเดียวต่อ isolate เพื่อให้ cache ในหน่วยความจำใช้ร่วมกันระหว่างคำขอ
    app ??= createApp(loadConfig(env));
    return app.fetch(request, env, ctx as never);
  },
};
