import type { WaterLevelStation } from '@flood-watch/shared';
import { formatNum } from './format';

/**
 * ภาพตัดขวางลำน้ำ: ท้องน้ำ ตลิ่ง และระดับน้ำปัจจุบัน ให้เห็นว่าน้ำสูง/ต่ำกว่าตลิ่งเท่าไร
 * วาดจากค่าที่วัดได้ (ไม่ใช่ภาพถ่าย)
 */
const W = 320;
const TOP = 34; // พื้นที่ด้านบนสำหรับข้อความผลต่าง
const BOTTOM = 136;
const H = 156;
// รูปทรงลำน้ำ (แกน x): ตลิ่งซ้าย → ลาดลง → ท้องน้ำ → ลาดขึ้น → ตลิ่งขวา
const BANK_L = 70;
const BED_L = 118;
const BED_R = 202;
const BANK_R = 250;

/** ระดับท้องน้ำ: ใช้ค่าจากสถานี ถ้าไม่มีให้ประมาณจากร้อยละความจุ (ร้อยละ = (น้ำ-ท้องน้ำ)/(ตลิ่ง-ท้องน้ำ)) */
function bedLevel(s: WaterLevelStation, level: number, bank: number): number {
  const low = Math.min(level, bank);
  if (s.groundMsl != null && s.groundMsl < low) return s.groundMsl;
  const p = s.percent === null ? null : s.percent / 100;
  if (p !== null && Math.abs(1 - p) > 0.02) {
    const g = (level - p * bank) / (1 - p);
    if (Number.isFinite(g) && g < low && low - g < 30) return g;
  }
  return low - 3;
}

export function waterDiagram(s: WaterLevelStation): string {
  const level = s.levelMsl;
  const bank = s.bankMsl;
  if (level === null || bank === null) return '';
  const bed = bedLevel(s, level, bank);
  const hi = Math.max(level, bank);
  const pad = (hi - bed) * 0.18 || 0.5;
  const y = (v: number) => TOP + ((hi + pad - v) / (hi + pad - bed)) * (BOTTOM - TOP);
  const yBank = y(bank);
  const yBed = y(bed);
  const yWater = y(level);
  const f = (n: number) => n.toFixed(1);

  const land = `M0 ${f(yBank)} H${BANK_L} L${BED_L} ${f(yBed)} H${BED_R} L${BANK_R} ${f(yBank)} H${W} V${H} H0 Z`;
  let water: string;
  if (level <= bank) {
    // จุดที่ผิวน้ำตัดกับตลิ่งที่ลาดเอียง
    const t = (yWater - yBank) / (yBed - yBank);
    const xl = BANK_L + t * (BED_L - BANK_L);
    const xr = BANK_R - t * (BANK_R - BED_R);
    water = `M${f(xl)} ${f(yWater)} L${BED_L} ${f(yBed)} H${BED_R} L${f(xr)} ${f(yWater)} Z`;
  } else {
    // น้ำล้นตลิ่ง: ท่วมพื้นที่สองฝั่ง
    water = `M0 ${f(yWater)} H${W} V${f(yBank)} H${BANK_R} L${BED_R} ${f(yBed)} H${BED_L} L${BANK_L} ${f(yBank)} H0 Z`;
  }

  const diff = level - bank;
  const over = diff > 0;
  const diffText = `${over ? 'สูงกว่าตลิ่ง' : 'ต่ำกว่าตลิ่ง'} ${formatNum(Math.abs(diff), 2)} ม.`;
  const depth = level - bed;
  const labelBelow = Math.abs(yWater - yBank) < 14; // ป้ายชิดกันเกินไป ให้วางคนละด้านของเส้น
  const waterLabelY = over || !labelBelow ? yWater - 5 : yWater + 13;
  const bankLabelY = over && labelBelow ? yBank + 13 : yBank - 5;

  return `
    <figure class="xs" aria-label="ภาพตัดขวางลำน้ำ: ระดับน้ำ ${formatNum(level)} ม.รทก. ตลิ่ง ${formatNum(bank)} ม.รทก. ${diffText}">
      <svg viewBox="0 0 ${W} ${H}" role="img" preserveAspectRatio="xMidYMid meet">
        <text class="xs-diff ink-${s.status}" x="${W / 2}" y="20" text-anchor="middle">${diffText}</text>
        <path class="xs-water" d="${water}"/>
        <line class="xs-surface st-stroke-${s.status}" x1="${over ? 0 : BANK_L - 6}" x2="${over ? W : BANK_R + 6}" y1="${f(yWater)}" y2="${f(yWater)}"/>
        <path class="xs-land" d="${land}"/>
        <line class="xs-bank" x1="0" x2="${W}" y1="${f(yBank)}" y2="${f(yBank)}"/>
        <text class="xs-label" x="6" y="${f(bankLabelY)}">ตลิ่ง ${formatNum(bank)}</text>
        <text class="xs-label xs-label-water" x="${W - 6}" y="${f(waterLabelY)}" text-anchor="end">น้ำ ${formatNum(level)}</text>
        <text class="xs-note" x="${(BED_L + BED_R) / 2}" y="${f(Math.min(yBed + 14, H - 4))}" text-anchor="middle">ลึกประมาณ ${formatNum(depth, 1)} ม.</text>
      </svg>
      <figcaption>ภาพจำลองจากค่าที่วัดได้ · หน่วย ม.รทก. (เมตรจากระดับทะเลปานกลาง)</figcaption>
    </figure>`;
}
