import type { Camera } from '@flood-watch/shared';
import type HlsType from 'hls.js/light';
import { escapeHtml, formatAgo } from './format';
import { icons } from './icons';
import { apiUrl } from './api';

/**
 * แสดงภาพจากกล้องในหน้ารายละเอียด ลองแหล่งภาพตามลำดับ:
 * วิดีโอ HLS → ภาพเคลื่อนไหว MJPEG → ภาพนิ่ง (รีเฟรชเอง) → แจ้งว่าไม่มีภาพ
 * (กล้องกรมทางหลวงผ่าน iTIC ส่งภาพ MJPEG/ภาพนิ่งว่างเปล่า มีเฉพาะ HLS)
 */

export type SourceKind = 'hls' | 'mjpeg' | 'clip' | 'still' | 'page';
export interface Source {
  kind: SourceKind;
  url: string;
  /** ลิงก์ที่ต้องขอก่อนเล่น (เช่น session ภาพสดที่มีอายุ) — ได้ URL จริงจากค่า hlsUrl ที่ตอบกลับ */
  resolve?: () => Promise<string>;
}

async function hlsFromSession(path: string): Promise<string> {
  const res = await fetch(apiUrl(path), { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { hlsUrl } = (await res.json()) as { hlsUrl?: string };
  if (!hlsUrl?.startsWith('https://')) throw new Error('ไม่มีลิงก์ภาพสด');
  return hlsUrl;
}

/** ถ้าแหล่งภาพไม่ขึ้นภายในเวลานี้ ให้ลองแหล่งถัดไป */
const SOURCE_TIMEOUT_MS = 10000;
/** วิดีโอสดบนมือถือเริ่มช้ากว่า (ต้องขอ session + โหลดตัวเล่น + รอ segment แรก) */
const HLS_TIMEOUT_MS = 25000;
/** ภาพนิ่งบางแหล่งต้องส่งต่อผ่าน API ของแอปและต้นทางตอบช้า (เช่น นนทบุรี ~5–15 วินาที) — เป็นแหล่งสุดท้ายจึงรอได้นานกว่า */
const STILL_TIMEOUT_MS = 25000;
const SNAPSHOT_REFRESH_MS = 10000;
/** ลองโหลดรายการวิดีโอสดซ้ำกี่ครั้ง และเว้นช่วงเท่าไร เมื่อสตรีมยังไม่พร้อม */
const HLS_MANIFEST_RETRIES = 5;
const HLS_RETRY_DELAY_MS = 3000;

const LABEL: Record<SourceKind | 'loading' | 'off', string> = {
  hls: 'ภาพสด',
  mjpeg: 'ภาพสด',
  clip: 'คลิปวิดีโอ',
  still: 'ภาพนิ่ง · อัปเดตทุก 10 วินาที',
  page: 'หน้าเว็บต้นทาง',
  loading: 'กำลังโหลด',
  off: 'ไม่มีภาพ',
};

/** แหล่งภาพของกล้องตามลำดับที่หน้าต่างกล้องลอง (ใช้ร่วมกับหน้าตรวจสถานะกล้อง /status) */
export function sourcesOf(c: Camera): Source[] {
  const list: Source[] = [];
  if (c.hlsUrl) list.push({ kind: 'hls', url: c.hlsUrl });
  else if (c.hlsSessionUrl) {
    const path = c.hlsSessionUrl;
    list.push({ kind: 'hls', url: '', resolve: () => hlsFromSession(path) });
  }
  if (c.streamUrl) list.push({ kind: 'mjpeg', url: apiUrl(c.streamUrl) });
  if (c.videoUrl?.startsWith('https://')) list.push({ kind: 'clip', url: c.videoUrl });
  if (c.imageUrl) list.push({ kind: 'still', url: apiUrl(c.imageUrl) });
  // หน้าเว็บของผู้ให้บริการ (ฝังได้เฉพาะ https)
  if (c.embedUrl?.startsWith('https://')) list.push({ kind: 'page', url: c.embedUrl });
  return list;
}

export function hasCameraMedia(c: Camera): boolean {
  return sourcesOf(c).length > 0;
}

/**
 * กล้องที่น่าจะดูภาพสดได้ (ใช้แยกสีหมุด) — นับเฉพาะที่มีวิดีโอ HLS
 * เพราะกล้องที่มีแต่ MJPEG/ภาพนิ่งส่วนใหญ่ออฟไลน์ที่ต้นทาง (ตรวจ ก.ย. 2569)
 */
export function isLiveCamera(c: Camera): boolean {
  return !!(c.hlsUrl || c.hlsSessionUrl || c.embedUrl);
}

export function cameraViewHtml(c: Camera): string {
  if (!hasCameraMedia(c)) return '';
  return `
    <figure class="cam-view" data-cam-view data-cam-id="${escapeHtml(c.id)}" data-mode="loading">
      <div class="cam-frame">
        <div class="cam-media"></div>
        <div class="cam-msg" role="status">กำลังโหลดภาพ…</div>
        <button type="button" class="cam-refresh" data-cam-refresh aria-label="โหลดภาพใหม่" title="โหลดภาพใหม่">${icons.refresh(18)}</button>
      </div>
      <figcaption>
        <span class="cam-badge"><i></i><span data-cam-label>${LABEL.loading}</span></span>
        <span>ภาพ: ${escapeHtml(c.imageCredit ?? c.owner)} · กล้องของ ${escapeHtml(c.owner)}</span>
      </figcaption>
    </figure>`;
}

// ---------- ตัวเล่น ----------
let current: { stop: () => void } | null = null;

export function stopCameraView() {
  current?.stop();
  current = null;
}

const bust = (url: string) => `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;

export function startCameraView(root: HTMLElement, c: Camera, fresh = false) {
  stopCameraView();
  const view = root.querySelector<HTMLElement>('[data-cam-view]');
  if (!view) return;
  const media = view.querySelector<HTMLElement>('.cam-media')!;
  const msg = view.querySelector<HTMLElement>('.cam-msg')!;
  const label = view.querySelector<HTMLElement>('[data-cam-label]')!;
  const sources = sourcesOf(c);
  let stopped = false;
  let timers: number[] = [];
  let hls: HlsType | null = null;

  const cleanup = () => {
    timers.forEach((t) => window.clearTimeout(t));
    timers = [];
    hls?.destroy();
    hls = null;
    // ถอด src ก่อนลบ เพื่อให้ browser ปิดการเชื่อมต่อภาพสดทันที
    media.querySelectorAll('img').forEach((el) => el.removeAttribute('src'));
    media.querySelectorAll('video').forEach((el) => {
      el.removeAttribute('src');
      el.load();
    });
    media.innerHTML = '';
  };

  const setMode = (mode: SourceKind | 'loading' | 'off') => {
    view.dataset.mode = mode;
    // ภาพนิ่งที่ต้นทางไม่ได้อัปเดตตลอด บอกอายุของภาพแทน "อัปเดตทุก 10 วินาที"
    const ago = c.imageTakenAt ? formatAgo(c.imageTakenAt) || 'ไม่ทราบเวลา' : '';
    label.textContent =
      mode === 'still' && ago ? `ภาพล่าสุดที่มี · ${ago}` : mode === 'clip' && ago ? `${LABEL.clip} · ${ago}` : LABEL[mode];
    view.classList.toggle('is-loaded', mode !== 'loading' && mode !== 'off');
  };

  const showOff = () => {
    cleanup();
    setMode('off');
    msg.textContent = 'ภาพจากกล้องนี้ยังไม่ขึ้น — กดปุ่มโหลดใหม่ หรือเปิดดูในเว็บต้นทาง';
  };

  const tryFrom = (i: number) => {
    if (stopped) return;
    cleanup();
    const src = sources[i];
    if (!src) return showOff();
    setMode('loading');
    msg.textContent = 'กำลังโหลดภาพ…';
    let done = false;
    const next = () => {
      if (done || stopped) return;
      done = true;
      tryFrom(i + 1);
    };
    const ok = () => {
      if (stopped) return;
      done = true;
      setMode(src.kind);
    };
    // หน้าเว็บอาจโหลดช้า ไม่ตัดทิ้งตามเวลา
    if (src.kind !== 'page') {
      const wait = src.kind === 'hls' ? HLS_TIMEOUT_MS : src.kind === 'still' ? STILL_TIMEOUT_MS : SOURCE_TIMEOUT_MS;
      timers.push(window.setTimeout(() => !done && next(), wait));
    }

    if (src.kind === 'page') {
      // เบราว์เซอร์ไม่บอกว่าหน้าถูกบล็อกการฝังหรือไม่ จึงถือว่าสำเร็จเมื่อโหลดเสร็จ และมีปุ่มเปิดในเว็บต้นทางเสมอ
      const frame = document.createElement('iframe');
      frame.src = src.url;
      frame.title = `หน้าเว็บกล้อง ${c.name}`;
      frame.referrerPolicy = 'no-referrer';
      frame.setAttribute('allow', 'autoplay; fullscreen');
      frame.addEventListener('load', ok, { once: true });
      // เลื่อนหน้าเว็บขึ้นเพื่อข้ามเมนูของต้นทาง (ฝังข้ามโดเมนสั่งเลื่อนในกรอบไม่ได้) ผู้ใช้ยังเลื่อนดูต่อในกรอบได้
      const crop = Math.max(0, Math.min(2000, c.embedCropTop ?? 0));
      if (crop) {
        frame.style.top = `-${crop}px`;
        frame.style.height = `calc(100% + ${crop}px)`;
      }
      view.classList.add('is-page');
      media.appendChild(frame);
      return;
    }

    if (src.kind === 'hls' && src.resolve && !src.url) {
      // ขอลิงก์ภาพสดก่อน แล้วเล่นแหล่งเดิมด้วยลิงก์ที่ได้
      const resolve = src.resolve;
      void resolve()
        .then((url) => {
          if (stopped || done) return;
          sources[i] = { kind: 'hls', url };
          done = true;
          tryFrom(i);
          // คืนค่าเดิมไว้ เผื่อกดโหลดใหม่หลังลิงก์หมดอายุ
          sources[i] = { kind: 'hls', url: '', resolve };
        })
        .catch(next);
      return;
    }

    if (src.kind === 'clip') {
      // คลิปสั้น (mp4) — ให้ผู้ใช้กดเล่นเอง แสดงภาพนิ่งเป็นภาพปก
      const video = document.createElement('video');
      video.controls = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.preload = 'metadata';
      if (c.imageUrl) video.poster = apiUrl(c.imageUrl);
      video.setAttribute('aria-label', `คลิปวิดีโอ ${c.name}`);
      video.addEventListener('loadedmetadata', ok, { once: true });
      video.addEventListener('error', next, { once: true });
      video.src = src.url;
      media.appendChild(video);
      return;
    }

    if (src.kind === 'hls') {
      const video = document.createElement('video');
      // iOS เล่นอัตโนมัติได้เมื่อมี attribute muted/playsinline ในตัว element (ตั้งแค่ property ไม่พอ)
      video.muted = true;
      video.setAttribute('muted', '');
      video.autoplay = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      // จำเป็นสำหรับ ManagedMediaSource ของ iOS (hls.js)
      video.disableRemotePlayback = true;
      video.setAttribute('aria-label', `ภาพสดจากกล้อง ${c.name}`);
      video.addEventListener('playing', ok, { once: true });
      // ภาพพร้อมแต่เครื่องไม่ยอมเล่นอัตโนมัติ (เช่น โหมดประหยัดพลังงานของ iOS) → แสดงปุ่มเล่นแทนการเปลี่ยนไปใช้ภาพนิ่ง
      video.addEventListener(
        'loadeddata',
        () =>
          window.setTimeout(() => {
            if (stopped || done || !video.paused) return;
            video.controls = true;
            ok();
          }, 1500),
        { once: true },
      );
      video.addEventListener('error', next, { once: true });
      media.appendChild(video);
      const native = () => {
        video.src = src.url;
        void video.play().catch(() => {});
      };
      // ใช้ hls.js ทุกเครื่องที่รองรับ (รวม iPhone/iPad iOS 17.1+ ผ่าน ManagedMediaSource) เพราะเริ่มภาพได้เร็วกว่า
      // ตัวเล่น HLS ในตัวของ Safari; เครื่องที่ไม่รองรับใช้ตัวเล่นในตัวแทน
      void import('hls.js/light')
        .then(({ default: Hls }) => {
          if (stopped || done) return;
          if (Hls.isSupported()) {
            // สตรีมบางแหล่งเริ่มส่งเมื่อมีคนขอดู (เช่น กล้องทางหลวง) คำขอแรกจึงได้ 404 — ลองโหลดรายการวิดีโอซ้ำก่อนเปลี่ยนแหล่ง
            // (เวลารวมยังถูกจำกัดด้วย HLS_TIMEOUT_MS)
            let retries = 0;
            const start = () => {
              if (stopped || done) return;
              hls?.destroy();
              const player = new Hls({ lowLatencyMode: false });
              hls = player;
              player.on(Hls.Events.ERROR, (_e, data) => {
                if (!data.fatal || stopped || done || hls !== player) return;
                const notReady = data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR || data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT;
                if (notReady && retries < HLS_MANIFEST_RETRIES) {
                  retries++;
                  timers.push(window.setTimeout(start, HLS_RETRY_DELAY_MS));
                } else next();
              });
              player.loadSource(src.url);
              player.attachMedia(video);
              void video.play().catch(() => {});
            };
            start();
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) native();
          else next();
        })
        .catch(() => (video.canPlayType('application/vnd.apple.mpegurl') ? native() : next()));
      return;
    }

    const img = document.createElement('img');
    img.alt = `ภาพจากกล้อง ${c.name}`;
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('load', () => {
      // เซิร์ฟเวอร์บางตัวตอบกลับสำเร็จแต่ไม่มีภาพ
      if (img.naturalWidth > 0) ok();
      else next();
    });
    // ภาพขึ้นแล้ว: ภาพนิ่งเก็บภาพเดิมไว้ (โหลดภาพใหม่แยกต่างหาก) — error หลังจากนี้ไม่ต้องตัดภาพทิ้ง
    img.addEventListener('error', () => {
      if (!done) next();
    });
    img.src = fresh || src.kind === 'still' ? bust(src.url) : src.url;
    media.appendChild(img);
    if (src.kind === 'mjpeg') {
      // MJPEG บางเบราว์เซอร์ไม่ส่ง load จนกว่าจะจบ จึงตรวจขนาดภาพแทน
      const check = window.setInterval(() => {
        if (stopped || done) return window.clearInterval(check);
        if (img.naturalWidth > 0) {
          window.clearInterval(check);
          ok();
        }
      }, 500);
      timers.push(check);
    }
    // ภาพที่ถ่ายไว้แล้ว (มีเวลาถ่าย) ไม่ต้องโหลดซ้ำ
    if (src.kind === 'still' && !c.imageTakenAt) {
      // โหลดภาพใหม่ใน Image แยก แล้วค่อยสลับเมื่อได้ภาพ — ถ้าต้นทางตอบช้า/ล้มเหลวรอบใด ยังเห็นภาพล่าสุดอยู่
      const refresh = () => {
        if (stopped) return;
        const schedule = () => !stopped && timers.push(window.setTimeout(refresh, SNAPSHOT_REFRESH_MS));
        if (!done) return schedule();
        const loader = new Image();
        loader.referrerPolicy = 'no-referrer';
        loader.onload = () => {
          if (stopped) return;
          if (loader.naturalWidth > 0) img.src = loader.src;
          schedule();
        };
        loader.onerror = schedule;
        loader.src = bust(src.url);
      };
      timers.push(window.setTimeout(refresh, SNAPSHOT_REFRESH_MS));
    }
  };

  current = {
    stop: () => {
      stopped = true;
      cleanup();
    },
  };
  tryFrom(0);
}
