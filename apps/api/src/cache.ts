interface Entry<T> {
  value: T;
  fetchedAt: number;
}

export interface CachedResult<T> {
  value: T;
  fetchedAt: Date;
  stale: boolean;
}

/**
 * cache ในหน่วยความจำแบบง่าย ใช้ลดภาระระบบต้นทาง
 * - ภายใน ttl: ส่งค่าจาก cache
 * - เกิน ttl: ดึงใหม่ ถ้าล้มเหลวและค่าเก่ายังไม่เกิน staleMax ให้ส่งค่าเก่าพร้อม stale=true
 * - คำขอพร้อมกันหลายรายการใช้ promise เดียวกัน
 */
export class TtlCache {
  private entries = new Map<string, Entry<unknown>>();
  private inflight = new Map<string, Promise<unknown>>();

  constructor(
    private ttlMs: number,
    private staleMaxMs: number,
    private now: () => number = Date.now,
  ) {}

  async get<T>(key: string, load: () => Promise<T>): Promise<CachedResult<T>> {
    const entry = this.entries.get(key) as Entry<T> | undefined;
    if (entry && this.now() - entry.fetchedAt < this.ttlMs) {
      return { value: entry.value, fetchedAt: new Date(entry.fetchedAt), stale: false };
    }

    try {
      const value = await this.loadOnce(key, load);
      const fresh = this.entries.get(key) as Entry<T>;
      return { value, fetchedAt: new Date(fresh.fetchedAt), stale: false };
    } catch (err) {
      if (entry && this.now() - entry.fetchedAt < this.staleMaxMs) {
        return { value: entry.value, fetchedAt: new Date(entry.fetchedAt), stale: true };
      }
      throw err;
    }
  }

  private loadOnce<T>(key: string, load: () => Promise<T>): Promise<T> {
    let pending = this.inflight.get(key) as Promise<T> | undefined;
    if (!pending) {
      pending = load()
        .then((value) => {
          this.entries.set(key, { value, fetchedAt: this.now() });
          return value;
        })
        .finally(() => this.inflight.delete(key));
      this.inflight.set(key, pending);
    }
    return pending;
  }
}
