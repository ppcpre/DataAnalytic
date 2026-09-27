/**
 * เก็บค่าระดับน้ำย้อนหลัง เพื่อคำนวณแนวโน้ม (↑↓) และแสดงกราฟ
 * - MemoryHistoryStore: สำหรับ Node.js / ทดสอบ (หายเมื่อรีสตาร์ท)
 * - D1HistoryStore: สำหรับ Cloudflare Workers (ฐานข้อมูล D1 ใช้ฟรีได้)
 */
import type { Trend, WaterLevelStation } from '@flood-watch/shared';

export interface Reading {
  stationId: string;
  /** เวลาวัด (มิลลิวินาที) */
  t: number;
  level: number | null;
  percent: number | null;
}

export interface HistoryStore {
  record(rows: Reading[]): Promise<void>;
  /** ค่าของสถานีเดียวตั้งแต่ sinceMs เรียงตามเวลา */
  series(stationId: string, sinceMs: number): Promise<Reading[]>;
  /** ค่าของทุกสถานีในช่วงเวลา (ใช้คำนวณแนวโน้ม) */
  range(fromMs: number, toMs: number): Promise<Reading[]>;
  prune(beforeMs: number): Promise<void>;
}

export const HOUR = 3600_000;
export const RETENTION_MS = 7 * 24 * HOUR;

export function toReadings(stations: WaterLevelStation[]): Reading[] {
  return stations.map((s) => ({
    stationId: s.id,
    t: new Date(s.observedAt).getTime(),
    level: s.levelMsl,
    percent: s.percent,
  }));
}

export class MemoryHistoryStore implements HistoryStore {
  private data = new Map<string, Reading[]>();

  async record(rows: Reading[]) {
    for (const r of rows) {
      if (!Number.isFinite(r.t)) continue;
      const list = this.data.get(r.stationId) ?? [];
      if (!list.some((x) => x.t === r.t)) {
        list.push(r);
        list.sort((a, b) => a.t - b.t);
      }
      this.data.set(r.stationId, list);
    }
  }

  async series(stationId: string, sinceMs: number) {
    return (this.data.get(stationId) ?? []).filter((r) => r.t >= sinceMs);
  }

  async range(fromMs: number, toMs: number) {
    return [...this.data.values()].flat().filter((r) => r.t >= fromMs && r.t <= toMs);
  }

  async prune(beforeMs: number) {
    for (const [id, list] of this.data) this.data.set(id, list.filter((r) => r.t >= beforeMs));
  }
}

/** ส่วนของ D1 API ที่ใช้ (ไม่ต้องพึ่ง @cloudflare/workers-types) */
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface D1Like {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown>;
}

interface Row {
  station_id: string;
  t: number;
  level: number | null;
  percent: number | null;
}

const fromRow = (r: Row): Reading => ({ stationId: r.station_id, t: r.t, level: r.level, percent: r.percent });

export class D1HistoryStore implements HistoryStore {
  private ready: Promise<unknown> | null = null;

  constructor(private db: D1Like) {}

  private init() {
    this.ready ??= this.db.batch([
      this.db.prepare(
        'CREATE TABLE IF NOT EXISTS readings (station_id TEXT NOT NULL, t INTEGER NOT NULL, level REAL, percent REAL, PRIMARY KEY (station_id, t))',
      ),
      this.db.prepare('CREATE INDEX IF NOT EXISTS readings_t ON readings (t)'),
    ]);
    return this.ready;
  }

  async record(rows: Reading[]) {
    await this.init();
    const valid = rows.filter((r) => Number.isFinite(r.t));
    for (let i = 0; i < valid.length; i += 50) {
      await this.db.batch(
        valid
          .slice(i, i + 50)
          .map((r) =>
            this.db
              .prepare('INSERT OR IGNORE INTO readings (station_id, t, level, percent) VALUES (?, ?, ?, ?)')
              .bind(r.stationId, r.t, r.level, r.percent),
          ),
      );
    }
  }

  async series(stationId: string, sinceMs: number) {
    await this.init();
    const { results } = await this.db
      .prepare('SELECT station_id, t, level, percent FROM readings WHERE station_id = ? AND t >= ? ORDER BY t')
      .bind(stationId, sinceMs)
      .all<Row>();
    return results.map(fromRow);
  }

  async range(fromMs: number, toMs: number) {
    await this.init();
    const { results } = await this.db
      .prepare('SELECT station_id, t, level, percent FROM readings WHERE t >= ? AND t <= ?')
      .bind(fromMs, toMs)
      .all<Row>();
    return results.map(fromRow);
  }

  async prune(beforeMs: number) {
    await this.init();
    await this.db.prepare('DELETE FROM readings WHERE t < ?').bind(beforeMs).run();
  }
}

/** เกณฑ์ว่า "เปลี่ยนจริง": ระดับน้ำ 3 ซม. หรือ 2% ของตลิ่ง */
const LEVEL_EPS = 0.03;
const PERCENT_EPS = 2;
const TARGET_AGO = 3 * HOUR;

/**
 * เทียบค่าปัจจุบันกับค่าที่ใกล้ "3 ชม.ก่อน" ที่สุด (ยอมรับช่วง 1.5–6 ชม.ก่อน)
 */
export function computeTrend(current: Reading, past: Reading[]): Trend | null {
  const candidates = past.filter(
    (r) => r.stationId === current.stationId && r.t <= current.t - 1.5 * HOUR && r.t >= current.t - 6 * HOUR,
  );
  if (!candidates.length) return null;
  const ref = candidates.reduce((best, r) =>
    Math.abs(current.t - TARGET_AGO - r.t) < Math.abs(current.t - TARGET_AGO - best.t) ? r : best,
  );
  const sinceHours = Math.round(((current.t - ref.t) / HOUR) * 10) / 10;

  let change: number;
  let unit: Trend['unit'];
  let eps: number;
  if (current.level !== null && ref.level !== null) {
    change = current.level - ref.level;
    unit = 'm';
    eps = LEVEL_EPS;
  } else if (current.percent !== null && ref.percent !== null) {
    change = current.percent - ref.percent;
    unit = '%';
    eps = PERCENT_EPS;
  } else {
    return null;
  }
  const direction = change >= eps ? 'rise' : change <= -eps ? 'fall' : 'steady';
  return { direction, change: Math.round(change * 100) / 100, unit, sinceHours };
}

/** บันทึกค่าล่าสุด แล้วเติมแนวโน้มให้แต่ละสถานี (ถ้าที่เก็บข้อมูลมีปัญหา ส่งข้อมูลเดิมกลับโดยไม่มีแนวโน้ม) */
export async function recordAndAttachTrends(
  store: HistoryStore,
  stations: WaterLevelStation[],
  now = Date.now(),
): Promise<WaterLevelStation[]> {
  const readings = toReadings(stations);
  try {
    await store.record(readings);
    const past = await store.range(now - 8 * HOUR, now);
    const byStation = new Map<string, Reading[]>();
    for (const r of past) byStation.set(r.stationId, [...(byStation.get(r.stationId) ?? []), r]);
    return stations.map((s, i) => ({ ...s, trend: computeTrend(readings[i], byStation.get(s.id) ?? []) }));
  } catch (err) {
    console.error('[history]', err);
    return stations;
  }
}
