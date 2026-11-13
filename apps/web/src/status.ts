import type { Camera } from '@flood-watch/shared';
import { api } from './api';
import { sourcesOf, type Source, type SourceKind } from './camera-view';
import { escapeHtml } from './format';
import './status.css';

/**
 * หน้าตรวจสถานะกล้อง (/status): ลองเปิดภาพของกล้องทุกตัวจากเครื่องของผู้ใช้ ตามลำดับเดียวกับหน้าต่างกล้อง
 * แล้วสรุปว่าแต่ละแหล่งเปิดภาพได้กี่ตัว และกล้องตัวใดไม่มีภาพ
 */

type Outcome = 'live' | 'still' | 'page' | 'off' | 'none';
interface Result {
  cam: Camera;
  group: string;
  outcome: Outcome;
  /** แหล่งภาพที่เปิดได้ (หรือแหล่งสุดท้ายที่ลอง) */
  kind?: SourceKind;
  /** เหตุผลที่แต่ละแหล่งเปิดไม่ได้ */
  reasons: string[];
  ms: number;
}

const OUTCOME_LABEL: Record<Outcome, string> = {
  live: 'ภาพสด',
  still: 'ภาพนิ่ง',
  page: 'หน้าเว็บ',
  off: 'ไม่มีภาพ',
  none: 'ไม่มีกล้อง',
};
const KIND_LABEL: Record<SourceKind, string> = { hls: 'วิดีโอ', mjpeg: 'MJPEG', clip: 'คลิป', still: 'ภาพนิ่ง', page: 'หน้าเว็บ' };

/** แหล่งข้อมูลของกล้อง จากรหัส */
function groupOf(c: Camera): string {
  const id = c.id;
  if (id.startsWith('longdo-')) return 'Longdo / มูลนิธิ iTIC';
  if (id.startsWith('nont-')) return 'เทศบาลนครนนทบุรี';
  if (id.startsWith('sb-')) return `StreamBridge · ${c.owner}`;
  if (id.startsWith('rs-')) return 'เทศบาลนครรังสิต';
  if (id.startsWith('dwr-')) return 'กรมทรัพยากรน้ำ';
  if (id.startsWith('doh-')) return 'กรมทางหลวง';
  if (id.startsWith('pop-')) return 'สำนักการระบายน้ำ กทม. (POPNIX)';
  if (id.startsWith('bma-')) return 'กล้องจราจร กทม.';
  if (id.startsWith('pakkret-')) return 'เทศบาลนครปากเกร็ด';
  return c.owner;
}

const TIMEOUT: Record<SourceKind, number> = { hls: 15000, mjpeg: 12000, clip: 15000, still: 25000, page: 15000 };
const CONCURRENCY = 6;

class Fail extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => {
      onTimeout?.();
      reject(new Fail(`ไม่ตอบใน ${Math.round(ms / 1000)} วินาที`));
    }, ms);
    p.then(
      (v) => (window.clearTimeout(t), resolve(v)),
      (e: unknown) => (window.clearTimeout(t), reject(e)),
    );
  });
}

/** โหลดภาพ (ภาพนิ่ง/MJPEG) ใน Image — สำเร็จเมื่อได้ภาพที่มีขนาด */
function checkImage(url: string, ms: number): Promise<void> {
  const img = new Image();
  img.referrerPolicy = 'no-referrer';
  let poll = 0;
  const stop = () => {
    window.clearInterval(poll);
    img.removeAttribute('src');
  };
  const p = new Promise<void>((resolve, reject) => {
    img.onload = () => (img.naturalWidth > 0 ? resolve() : reject(new Fail('ได้ภาพว่าง')));
    img.onerror = () => reject(new Fail('ต้นทางไม่ส่งภาพ'));
    // MJPEG ไม่ส่ง load จนกว่าสตรีมจะจบ จึงตรวจขนาดภาพเป็นระยะ
    poll = window.setInterval(() => img.naturalWidth > 0 && resolve(), 300);
  });
  img.src = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
  return withTimeout(p, ms, stop).finally(stop);
}

/** ตรวจ playlist ของวิดีโอสด: ต้องเป็น m3u8 ที่มี segment หรือ stream ย่อย */
async function checkHls(url: string, ms: number): Promise<void> {
  const ac = new AbortController();
  const res = await withTimeout(fetch(url, { cache: 'no-store', signal: ac.signal }), ms, () => ac.abort()).catch((e: unknown) => {
    throw e instanceof Fail ? e : new Fail('เชื่อมต่อไม่ได้');
  });
  if (!res.ok) throw new Fail(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text.startsWith('#EXTM3U')) throw new Fail(text.trim() ? 'ไม่ใช่ไฟล์วิดีโอ' : 'ต้นทางส่ง playlist ว่าง');
  if (!/#EXTINF|#EXT-X-STREAM-INF/.test(text)) throw new Fail('playlist ไม่มีวิดีโอ');
}

function checkClip(url: string, ms: number): Promise<void> {
  const v = document.createElement('video');
  v.preload = 'metadata';
  v.muted = true;
  const stop = () => {
    v.removeAttribute('src');
    v.load();
  };
  const p = new Promise<void>((resolve, reject) => {
    v.onloadedmetadata = () => resolve();
    v.onerror = () => reject(new Fail('เปิดคลิปไม่ได้'));
  });
  v.src = url;
  return withTimeout(p, ms, stop).finally(stop);
}

/** หน้าเว็บที่ฝัง: ตรวจได้แค่ว่าเชื่อมต่อได้ (เบราว์เซอร์ไม่บอกว่าหน้าเว็บยอมให้ฝังหรือไม่) */
async function checkPage(url: string, ms: number): Promise<void> {
  const ac = new AbortController();
  await withTimeout(fetch(url, { mode: 'no-cors', cache: 'no-store', signal: ac.signal }), ms, () => ac.abort()).catch((e: unknown) => {
    throw e instanceof Fail ? e : new Fail('เชื่อมต่อไม่ได้');
  });
}

async function checkSource(src: Source): Promise<void> {
  const ms = TIMEOUT[src.kind];
  switch (src.kind) {
    case 'hls': {
      const url = src.url || (await withTimeout(src.resolve!(), ms).catch(() => Promise.reject(new Fail('ขอภาพสดจากต้นทางไม่สำเร็จ'))));
      return checkHls(url, ms);
    }
    case 'mjpeg':
    case 'still':
      return checkImage(src.url, ms);
    case 'clip':
      return checkClip(src.url, ms);
    case 'page':
      return checkPage(src.url, ms);
  }
}

async function checkCamera(cam: Camera): Promise<Result> {
  const t0 = performance.now();
  const group = groupOf(cam);
  const sources = sourcesOf(cam);
  const reasons: string[] = [];
  if (!sources.length) return { cam, group, outcome: 'none', reasons, ms: 0 };
  for (const src of sources) {
    try {
      await checkSource(src);
      const outcome: Outcome = src.kind === 'hls' || src.kind === 'mjpeg' ? 'live' : src.kind === 'page' ? 'page' : 'still';
      return { cam, group, outcome, kind: src.kind, reasons, ms: performance.now() - t0 };
    } catch (e) {
      reasons.push(`${KIND_LABEL[src.kind]}: ${e instanceof Fail ? e.message : 'เปิดไม่ได้'}`);
    }
  }
  return { cam, group, outcome: 'off', reasons, ms: performance.now() - t0 };
}

// ---------- หน้าจอ ----------
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const startBtn = $<HTMLButtonElement>('st-start');
const skipBox = $<HTMLInputElement>('st-skip');
const allBox = $<HTMLInputElement>('st-all');
const progress = document.querySelector<HTMLElement>('.st-progress')!;

let results: Result[] = [];
let total = 0;
let running = false;
let cancelled = false;

const secs = (ms: number) => `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} วิ`;

function render() {
  const done = results.length;
  $<HTMLElement>('st-bar').style.width = total ? `${(done / total) * 100}%` : '0';
  $<HTMLElement>('st-count').textContent = running ? `ตรวจแล้ว ${done} / ${total} จุด` : `ตรวจเสร็จ ${done} จุด · ${new Date().toLocaleTimeString('th-TH')}`;

  const groups = new Map<string, Record<Outcome, number>>();
  for (const r of results) {
    const g = groups.get(r.group) ?? { live: 0, still: 0, page: 0, off: 0, none: 0 };
    g[r.outcome]++;
    groups.set(r.group, g);
  }
  const cell = (n: number, cls: string) => `<td class="${n ? cls : 'st-zero'}">${n}</td>`;
  $<HTMLElement>('st-rows').innerHTML = [...groups]
    .sort((a, b) => b[1].off - a[1].off || a[0].localeCompare(b[0], 'th'))
    .map(([name, g]) => {
      const sum = g.live + g.still + g.page + g.off;
      return `<tr><th scope="row">${escapeHtml(name)}${g.none ? `<small>ไม่มีกล้อง ${g.none} จุด</small>` : ''}</th>${cell(g.live, 'st-ok')}${cell(
        g.still,
        'st-ok',
      )}${cell(g.page, 'st-mid')}${cell(g.off, 'st-bad')}<td>${sum}</td></tr>`;
    })
    .join('');
  const off = results.filter((r) => r.outcome === 'off').length;
  const withCam = results.filter((r) => r.outcome !== 'none').length;
  $<HTMLElement>('st-note').textContent = withCam
    ? `เปิดภาพได้ ${withCam - off} จาก ${withCam} กล้อง (${Math.round(((withCam - off) / withCam) * 100)}%) · "หน้าเว็บ" = เชื่อมต่อหน้าเว็บต้นทางได้ แต่ตรวจไม่ได้ว่าหน้าเว็บยอมให้ฝังในแอปหรือไม่`
    : '';
  $<HTMLElement>('st-summary').hidden = !results.length;

  const list = allBox.checked ? results : results.filter((r) => r.outcome === 'off');
  $<HTMLElement>('st-list-title').textContent = allBox.checked ? `ทุกกล้อง (${list.length})` : `กล้องที่ไม่มีภาพ (${list.length})`;
  $<HTMLElement>('st-items').innerHTML = list.length
    ? list
        .slice()
        .sort((a, b) => a.group.localeCompare(b.group, 'th') || a.cam.name.localeCompare(b.cam.name, 'th'))
        .map(
          (r) => `
        <li class="st-item">
          <div class="st-item-main">
            <span class="st-pill st-pill-${r.outcome}">${OUTCOME_LABEL[r.outcome]}${r.kind && r.outcome === 'live' ? ` · ${KIND_LABEL[r.kind]}` : ''}</span>
            <strong>${escapeHtml(r.cam.name)}</strong>
            <small>${escapeHtml(r.group)}${r.outcome !== 'none' ? ` · ${secs(r.ms)}` : ''}</small>
            ${r.reasons.length ? `<small class="st-reason">${r.reasons.map(escapeHtml).join(' · ')}</small>` : ''}
          </div>
          <div class="st-item-links">
            <a href="/?cam=${encodeURIComponent(r.cam.id)}" target="_blank" rel="noopener">เปิดในแอป</a>
            <a href="${escapeHtml(r.cam.url)}" target="_blank" rel="noopener noreferrer">เว็บต้นทาง</a>
          </div>
        </li>`,
        )
        .join('')
    : `<li class="st-empty">${running ? 'ยังไม่พบกล้องที่ไม่มีภาพ' : 'ทุกกล้องเปิดภาพได้'}</li>`;
  $<HTMLElement>('st-list').hidden = !results.length;
}

let renderQueued = false;
const queueRender = () => {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
};

async function run() {
  running = true;
  cancelled = false;
  results = [];
  startBtn.textContent = 'หยุดตรวจ';
  progress.hidden = false;
  $<HTMLElement>('st-count').textContent = 'กำลังโหลดรายชื่อกล้อง…';
  try {
    const { data } = await api.cameras();
    const queue = skipBox.checked ? data.filter((c) => sourcesOf(c).length) : [...data];
    total = queue.length;
    render();
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length && !cancelled) {
          results.push(await checkCamera(queue.shift()!));
          queueRender();
        }
      }),
    );
  } catch (e) {
    $<HTMLElement>('st-count').textContent = `โหลดรายชื่อกล้องไม่สำเร็จ (${(e as Error).message})`;
    running = false;
    startBtn.textContent = 'เริ่มตรวจ';
    return;
  }
  running = false;
  total = results.length;
  startBtn.textContent = 'ตรวจอีกครั้ง';
  render();
}

startBtn.addEventListener('click', () => {
  if (running) {
    cancelled = true;
    startBtn.textContent = 'กำลังหยุด…';
  } else void run();
});
allBox.addEventListener('change', render);
