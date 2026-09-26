import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // ตั้ง BASE_PATH เมื่อโฮสต์ใต้ path ย่อย เช่น GitHub Pages (/DataAnalytic/)
  base: process.env.BASE_PATH ?? '/',
  server: {
    proxy: { '/api': 'http://localhost:8787' },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'ติดตามน้ำท่วม กทม. และปริมณฑล',
        short_name: 'น้ำท่วม กทม.',
        description: 'ดูระดับน้ำ ฝน ประตูระบายน้ำ และลิงก์กล้อง CCTV ในกรุงเทพฯ และปริมณฑล',
        lang: 'th',
        theme_color: '#0b5cad',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // ข้อมูลล่าสุด: พยายามดึงใหม่ก่อน ถ้าออฟไลน์ใช้ชุดล่าสุดที่เคยโหลด
            urlPattern: ({ url }) => url.pathname.startsWith('/api/') || url.pathname.includes('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 20, maxAgeSeconds: 24 * 3600 },
            },
          },
          {
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
