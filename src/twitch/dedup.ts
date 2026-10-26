/** Covers the entire match and reconnects, with bounded memory. Not raw text. */
export class Deduplicator {
  private seen = new Map<string, number>();
  constructor(
    private ttlMs = 600000,
    private maxEntries = 50000,
  ) {}
  accept(keys: string[], now: number) {
    for (const [key, expiry] of this.seen) {
      if (expiry > now) break;
      this.seen.delete(key);
    }
    if (keys.some((key) => (this.seen.get(key) ?? 0) > now)) return false;
    for (const key of keys) this.seen.set(key, now + this.ttlMs);
    while (this.seen.size > this.maxEntries)
      this.seen.delete(this.seen.keys().next().value!);
    return true;
  }
}
