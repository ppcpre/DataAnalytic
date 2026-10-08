import type { HistoryPoint, Trend } from '@flood-watch/shared';
import { escapeHtml, formatClock, formatNum } from './format';

/** ข้อความแนวโน้ม เช่น "↑ สูงขึ้น 20 ซม. ใน 3 ชม." */
export function trendText(t: Trend | null | undefined, short = false): string {
  if (!t) return '';
  const arrow = t.direction === 'rise' ? '↑' : t.direction === 'fall' ? '↓' : '→';
  if (short) return arrow;
  const amount =
    t.unit === 'm' ? `${formatNum(Math.abs(t.change) * 100, 0)} ซม.` : `${formatNum(Math.abs(t.change), 1)}%`;
  const hours = `${formatNum(t.sinceHours, 1)} ชม.`;
  if (t.direction === 'steady') return `${arrow} ทรงตัวใน ${hours}ที่ผ่านมา`;
  return `${arrow} ${t.direction === 'rise' ? 'สูงขึ้น' : 'ลดลง'} ${amount} ใน ${hours}`;
}

/** ช่วงแกนที่อ่านง่าย (0.05, 0.1, 0.2, 0.25, 0.5, 1 …) */
function niceStep(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

const THRESHOLDS: Array<[number, string]> = [
  [70, '70% เฝ้าระวัง'],
  [100, 'ตลิ่ง 100%'],
];

/**
 * กราฟเส้นระดับน้ำ (% ของตลิ่ง) ย้อนหลัง — ชุดข้อมูลเดียว จึงไม่มีกล่อง legend (หัวข้อบอกชื่อแล้ว)
 * มีเส้นอ้างอิงเกณฑ์ เฝ้าระวัง / ตลิ่ง, crosshair + tooltip เมื่อชี้, และตารางสำหรับอ่านแบบข้อความ
 */
export interface ChartOptions {
  /** ค่าที่วาด: % ของตลิ่ง (ค่าเริ่มต้น) หรือระดับน้ำเป็นเมตร */
  value?: 'percent' | 'level';
  /** เส้นอ้างอิงเมื่อวาดเป็นเมตร เช่น [[1.5, 'เฝ้าระวัง 1.5 ม.'], [2, 'วิกฤต 2 ม.']] */
  refs?: Array<[number, string]>;
  /** ชื่อกราฟสำหรับโปรแกรมอ่านหน้าจอ */
  title?: string;
}

export function renderHistoryChart(host: HTMLElement, raw: HistoryPoint[], hours: number, opts: ChartOptions = {}) {
  const meters = opts.value === 'level';
  const points = raw
    .filter((p) => (meters ? p.levelMsl : p.percent) !== null)
    .map((p) => ({ t: new Date(p.t).getTime(), v: (meters ? p.levelMsl : p.percent) as number, level: p.levelMsl }))
    .sort((a, b) => a.t - b.t);

  if (points.length < 2) {
    host.innerHTML = `<p class="chart-empty">ยังมีข้อมูลย้อนหลังไม่พอสำหรับกราฟ — ระบบเก็บค่าทุก 15 นาที กราฟจะแสดงเมื่อมีข้อมูลสะสม</p>`;
    return;
  }

  const W = Math.max(260, host.clientWidth || 320);
  const H = 150;
  const m = { top: 10, right: 12, bottom: 22, left: 34 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  const tEnd = points[points.length - 1].t;
  const tStart = Math.min(points[0].t, tEnd - hours * 3600_000);
  const vals = points.map((p) => p.v);
  const refs = meters ? (opts.refs ?? []) : THRESHOLDS;
  let yMin: number;
  let yMax: number;
  if (meters) {
    // ให้เห็นเส้นเฝ้าระวัง/วิกฤตเสมอ และเผื่อขอบบนล่างเล็กน้อย
    const lo = Math.min(...vals, ...refs.map(([v]) => v));
    const hi = Math.max(...vals, ...refs.map(([v]) => v));
    const pad = Math.max(0.1, (hi - lo) * 0.12);
    yMin = Math.floor((lo - pad) * 10) / 10;
    yMax = Math.ceil((hi + pad) * 10) / 10;
  } else {
    yMin = Math.max(0, Math.floor(Math.min(...vals, 60) / 10) * 10);
    yMax = Math.ceil(Math.max(...vals, 105) / 10) * 10;
  }
  const x = (t: number) => m.left + ((t - tStart) / (tEnd - tStart || 1)) * iw;
  const y = (v: number) => m.top + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const last = points[points.length - 1];

  const yTicks: number[] = [];
  const step = meters ? niceStep((yMax - yMin) / 4) : yMax - yMin > 60 ? 40 : 20;
  for (let v = Math.ceil(yMin / step) * step; v <= yMax + 1e-9; v += step) yTicks.push(Math.round(v * 100) / 100);
  const unit = meters ? ' ม.' : '%';
  const fmt = (v: number) => (meters ? formatNum(v, 2) : formatNum(v, 1));
  const xTicks = [0, 1, 2, 3].map((i) => tStart + ((tEnd - tStart) * i) / 3);

  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const label = `${opts.title ?? (meters ? 'กราฟระดับน้ำ' : 'กราฟระดับน้ำเทียบตลิ่ง')} ${hours} ชั่วโมง: ต่ำสุด ${fmt(min)}${unit} สูงสุด ${fmt(max)}${unit} ล่าสุด ${fmt(last.v)}${unit}`;

  host.innerHTML = `
    <div class="chart-wrap">
      <svg class="chart-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(label)}">
        ${yTicks
          .map(
            (v) =>
              `<line class="grid" x1="${m.left}" x2="${W - m.right}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${m.left - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`,
          )
          .join('')}
        ${refs.filter(([v]) => v >= yMin && v <= yMax)
          .map(
            ([v, name]) =>
              `<line class="ref" x1="${m.left}" x2="${W - m.right}" y1="${y(v)}" y2="${y(v)}"/><text class="ref-label" x="${m.left + 4}" y="${y(v) - 4}">${name}</text>`,
          )
          .join('')}
        ${xTicks
          .map(
            (t, i) =>
              `<text class="axis" x="${x(t)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}">${formatClock(
                new Date(t).toISOString(),
              ).replace(' น.', '')}</text>`,
          )
          .join('')}
        <path class="line" d="${path}"/>
        <circle class="end" cx="${x(last.t)}" cy="${y(last.v)}" r="4.5"/>
        <g class="hover" visibility="hidden">
          <line class="crosshair" y1="${m.top}" y2="${m.top + ih}"/>
          <circle class="hover-dot" r="4.5"/>
        </g>
        <rect class="hit" x="${m.left}" y="0" width="${iw}" height="${H}"/>
      </svg>
      <div class="chart-tip" hidden></div>
    </div>
    <details class="chart-table">
      <summary>ดูเป็นตาราง</summary>
      <table>
        <thead><tr><th scope="col">เวลา</th>${meters ? '<th scope="col">ระดับน้ำ (ม.)</th>' : '<th scope="col">% ตลิ่ง</th><th scope="col">ม.รทก.</th>'}</tr></thead>
        <tbody>${points
          .filter((_, i) => i % Math.max(1, Math.round(points.length / 12)) === 0 || i === points.length - 1)
          .reverse()
          .map(
            (p) =>
              `<tr><td>${formatClock(new Date(p.t).toISOString())}</td><td>${fmt(p.v)}</td>${meters ? '' : `<td>${formatNum(p.level)}</td>`}</tr>`,
          )
          .join('')}</tbody>
      </table>
    </details>`;

  const svg = host.querySelector('svg')!;
  const hover = svg.querySelector<SVGGElement>('.hover')!;
  const cross = svg.querySelector<SVGLineElement>('.crosshair')!;
  const dot = svg.querySelector<SVGCircleElement>('.hover-dot')!;
  const tip = host.querySelector<HTMLElement>('.chart-tip')!;

  const show = (clientX: number) => {
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    let best = points[0];
    for (const p of points) if (Math.abs(x(p.t) - px) < Math.abs(x(best.t) - px)) best = p;
    const cx = x(best.t);
    cross.setAttribute('x1', String(cx));
    cross.setAttribute('x2', String(cx));
    dot.setAttribute('cx', String(cx));
    dot.setAttribute('cy', String(y(best.v)));
    hover.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.innerHTML = `<strong>${fmt(best.v)}${unit}</strong> ${!meters && best.level !== null ? `· ${formatNum(best.level)} ม.รทก.` : ''}<br><span>${formatClock(
      new Date(best.t).toISOString(),
    )}</span>`;
    const left = (cx / W) * rect.width;
    tip.style.left = `${Math.min(Math.max(left, 60), rect.width - 60)}px`;
  };
  const hide = () => {
    hover.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  };
  svg.addEventListener('pointermove', (e) => show(e.clientX));
  svg.addEventListener('pointerdown', (e) => show(e.clientX));
  svg.addEventListener('pointerleave', hide);
}
