import type { Camera } from '@flood-watch/shared';
import type HlsType from 'hls.js/light';
import { escapeHtml } from './format';
import { icons } from './icons';

/**
 * แสดงภาพจากกล้องในหน้ารายละเอียด ลองแหล่งภาพตามลำดับ:
 * วิดีโอ HLS → ภาพเคลื่อนไหว MJPEG → ภาพนิ่ง (รีเฟรชเอง) → แจ้งว่าไม่มีภาพ
 * (กล้องกรมทางหลวงผ่าน iTIC ส่งภาพ MJPEG/ภาพนิ่งว่างเปล่า มีเฉพาะ HLS)
 */

type SourceKind = 'hls' | 'mjpeg' | 'still';
interface Source {
  kind: SourceKind;
  url: string;
}

/** ถ้าแหล่งภาพไม่ขึ้นภายในเวลานี้ ให้ลองแหล่งถัดไป */
const SOURCE_TIMEOUT_MS = 10000;
const SNAPSHOT_REFRESH_MS = 10000;

const LABEL: Record<SourceKind | 'loading' | 'off', string> = {
  hls: 'ภาพสด',
  mjpeg: 'ภาพสด',
  still: 'ภาพนิ่ง · อัปเดตทุก 10 วินาที',
  loading: 'กำลังโหลด',
  off: 'ไม่มีภาพ',
};

function sourcesOf(c: Camera): Source[] {
  const list: Source[] = [];
  if (c.hlsUrl) list.push({ kind: 'hls', url: c.hlsUrl });
  if (c.streamUrl) list.push({ kind: 'mjpeg', url: c.streamUrl });
  if (c.imageUrl) list.push({ kind: 'still', url: c.imageUrl });
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
  return !!c.hlsUrl;
}

export function cameraViewHtml(c: Camera): string {
  if (!hasCameraMedia(c)) return '';
  return `
    <figure class="cam-view" data-cam-view data-mode="loading">
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
    label.textContent = LABEL[mode];
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
    timers.push(window.setTimeout(() => !done && next(), SOURCE_TIMEOUT_MS));

    if (src.kind === 'hls') {
      const video = document.createElement('video');
      video.muted = true;
      video.autoplay = true;
      video.playsInline = true;
      video.setAttribute('aria-label', `ภาพสดจากกล้อง ${c.name}`);
      video.addEventListener('playing', ok, { once: true });
      video.addEventListener('error', next, { once: true });
      media.appendChild(video);
      void import('hls.js/light')
        .then(({ default: Hls }) => {
          if (stopped || done) return;
          if (Hls.isSupported()) {
            hls = new Hls({ lowLatencyMode: false });
            hls.on(Hls.Events.ERROR, (_e, data) => data.fatal && next());
            hls.loadSource(src.url);
            hls.attachMedia(video);
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = src.url; // Safari บน iPhone/iPad เล่น HLS ได้เอง
          } else next();
          void video.play().catch(() => {});
        })
        .catch(next);
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
    img.addEventListener('error', () => (done ? src.kind === 'still' && showOff() : next()));
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
    if (src.kind === 'still') {
      const refresh = () => {
        if (stopped) return;
        if (done) img.src = bust(src.url);
        timers.push(window.setTimeout(refresh, SNAPSHOT_REFRESH_MS));
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
