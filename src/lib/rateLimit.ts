/**
 * Minimal in-memory sliding-window rate limiter (per process). Good enough for low-volume public
 * endpoints; use a shared store (e.g. Redis) when running several instances.
 */
export interface RateLimiter {
  /** Records a hit for `key`; returns false when the key already reached the limit. */
  hit(key: string, now?: number): boolean;
  /** Milliseconds until `key` can hit again (0 when it is not limited). */
  retryAfterMs(key: string, now?: number): number;
  reset(): void;
}

export function createRateLimiter(options: { limit: number; windowMs: number }): RateLimiter {
  const hits = new Map<string, number[]>();
  let lastSweep = 0;

  const recent = (key: string, now: number) =>
    (hits.get(key) ?? []).filter((time) => now - time < options.windowMs);

  /** Drops keys without recent hits so the map cannot grow without bound. */
  const sweep = (now: number) => {
    if (now - lastSweep < options.windowMs) return;
    lastSweep = now;
    for (const [key, times] of hits) {
      if (times.every((time) => now - time >= options.windowMs)) hits.delete(key);
    }
  };

  return {
    hit(key, now = Date.now()) {
      sweep(now);
      const times = recent(key, now);
      if (times.length >= options.limit) {
        hits.set(key, times);
        return false;
      }
      times.push(now);
      hits.set(key, times);
      return true;
    },

    retryAfterMs(key, now = Date.now()) {
      const times = recent(key, now);
      if (times.length < options.limit) return 0;
      return options.windowMs - (now - times[0]!);
    },

    reset() {
      hits.clear();
    },
  };
}
