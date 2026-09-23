import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../src/lib/rateLimit';

describe('createRateLimiter', () => {
  it('allows up to the limit per key within the window', () => {
    const limiter = createRateLimiter({ limit: 5, windowMs: 1000 });
    const results = Array.from({ length: 6 }, (_, i) => limiter.hit('1.2.3.4', i));
    expect(results).toEqual([true, true, true, true, true, false]);
    expect(limiter.hit('5.6.7.8', 10)).toBe(true);
  });

  it('frees slots as old hits leave the window', () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(limiter.hit('ip', 0)).toBe(true);
    expect(limiter.hit('ip', 500)).toBe(true);
    expect(limiter.hit('ip', 900)).toBe(false);
    expect(limiter.retryAfterMs('ip', 900)).toBe(100);
    expect(limiter.hit('ip', 1000)).toBe(true);
    expect(limiter.retryAfterMs('other', 1000)).toBe(0);
  });
});
