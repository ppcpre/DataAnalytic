import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * maplibre-gl v6 โหลด web worker จากไฟล์แยก (maplibre-gl-worker.mjs + maplibre-gl-shared.mjs)
 * ซึ่ง Vite ไม่ได้คัดลอกให้ — plugin นี้เสิร์ฟ/คัดลอกไฟล์ทั้งสองไปไว้ที่ /maplibre/
 */
function maplibreWorker(): Plugin {
  const dir = dirname(createRequire(import.meta.url).resolve('maplibre-gl/package.json'));
  const files = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];
  const read = (f: string) => readFileSync(join(dir, 'dist', f));
  return {
    name: 'maplibre-worker',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const f = files.find((name) => req.url?.endsWith(`/maplibre/${name}`));
        if (!f) return next();
        res.setHeader('content-type', 'text/javascript');
        res.end(read(f));
      });
    },
    generateBundle() {
      for (const f of files) this.emitFile({ type: 'asset', fileName: `maplibre/${f}`, source: read(f) });
    },
  };
}

export default defineConfig({
  // ตั้ง BASE_PATH เมื่อโฮสต์ใต้ path ย่อย เช่น GitHub Pages (/DataAnalytic/)
  base: process.env.BASE_PATH ?? '/',
  server: {
    proxy: { '/api': 'http://localhost:8787' },
  },
  plugins: [
    maplibreWorker(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Pre-Monitoring · ติดตามน้ำท่วม กทม. และปริมณฑล',
        short_name: 'Pre-Monitoring',
        description: 'ดูระดับน้ำ ฝน ประตูระบายน้ำ และลิงก์กล้อง CCTV ในกรุงเทพฯ และปริมณฑล',
        lang: 'th',
        theme_color: '#F4F1EA',
        background_color: '#F4F1EA',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // maplibre-gl มีขนาดใหญ่ ต้องเพิ่มเพดานไฟล์ที่ precache ได้
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,webmanifest}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // ข้อมูลล่าสุด: พยายามดึงใหม่ก่อน ถ้าออฟไลน์ใช้ชุดล่าสุดที่เคยโหลด
            // ไม่ cache ผลค้นหาสถานที่ใน service worker (cache ที่เซิร์ฟเวอร์แล้ว)
            urlPattern: ({ url }) =>
              url.pathname.includes('/api/') &&
              // ภาพ/คลิปจากเว็บของเทศบาลนครรังสิต (เส้นทาง /api/flood/… ของต้นทาง) ไม่ใช่ข้อมูลของแอป
              !url.pathname.startsWith('/api/flood/') &&
              !url.pathname.endsWith('/api/geocode') &&
              !url.pathname.endsWith('/api/nont/image') &&
              !url.pathname.endsWith('/api/bma/image') &&
              // ลิงก์ภาพสดมีอายุสั้น ห้ามใช้ค่าเก่าจาก cache
              !url.pathname.endsWith('/session'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 20, maxAgeSeconds: 24 * 3600 },
            },
          },
          {
            // OpenFreeMap: style, vector tiles, fonts, sprites — ใช้ของใน cache ก่อน แล้วอัปเดตเบื้องหลัง
            urlPattern: ({ url }) => url.hostname === 'tiles.openfreemap.org',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'openfreemap',
              expiration: { maxEntries: 1000, maxAgeSeconds: 7 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // ฟอนต์ Mitr
            urlPattern: ({ url }) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // แผนที่สำรอง
            urlPattern: ({ url }) => url.hostname.endsWith('tile.openstreetmap.org'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 300, maxAgeSeconds: 7 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
