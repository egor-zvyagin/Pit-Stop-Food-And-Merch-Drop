/**
 * Pit Stop v3: Per-Instance Token-Bucket Rate Limiter
 *
 * - Returns 429 with Retry-After header when the bucket is exhausted.
 * - Transparently skips (passes all requests) in test environments:
 *   NODE_ENV === 'test' or process.env.VITEST is set.
 */

import { NextResponse } from 'next/server';

export interface RateLimiterOptions {
  /** Maximum tokens in the bucket (burst capacity). */
  capacity: number;
  /** Tokens refilled per second. */
  refillRatePerSecond: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed to proceed. */
  allowed: boolean;
  /** Pre-built 429 response when not allowed; undefined when allowed. */
  response?: NextResponse;
}

export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefillMs: number;
  private readonly capacity: number;
  private readonly refillRatePerSecond: number;

  constructor(options: RateLimiterOptions) {
    this.capacity = options.capacity;
    this.refillRatePerSecond = options.refillRatePerSecond;
    this.tokens = options.capacity;
    this.lastRefillMs = Date.now();
  }

  /**
   * Attempt to consume one token. Returns whether the request is allowed.
   * In test environments all requests are allowed immediately.
   */
  consume(): RateLimitResult {
    // Skip rate limiting in test environments
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      return { allowed: true };
    }

    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return { allowed: true };
    }

    // Calculate seconds until a token is available again
    const retryAfterSecs = Math.ceil(1 / this.refillRatePerSecond);

    const response = NextResponse.json(
      {
        success: false,
        error: 'Too Many Requests — rate limit exceeded. Please wait before retrying.',
        retryAfterSeconds: retryAfterSecs,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSecs),
          'X-RateLimit-Limit': String(this.capacity),
          'X-RateLimit-Remaining': '0',
        },
      }
    );

    return { allowed: false, response };
  }

  private refill(): void {
    const nowMs = Date.now();
    const elapsedSecs = (nowMs - this.lastRefillMs) / 1000;
    const tokensToAdd = elapsedSecs * this.refillRatePerSecond;
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefillMs = nowMs;
  }
}

/**
 * Convenience factory for common API rate limits.
 * - 'standard': 20 requests burst, 10/s refill  (most API endpoints)
 * - 'orders':   10 requests burst, 2/s refill    (POST /api/orders — heavier ops)
 * - 'vendor':   30 requests burst, 15/s refill   (vendor kiosk endpoints)
 */
export function createRateLimiter(
  preset: 'standard' | 'orders' | 'vendor' = 'standard'
): TokenBucketRateLimiter {
  const presets: Record<string, RateLimiterOptions> = {
    standard: { capacity: 20, refillRatePerSecond: 10 },
    orders:   { capacity: 10, refillRatePerSecond: 2 },
    vendor:   { capacity: 30, refillRatePerSecond: 15 },
  };
  return new TokenBucketRateLimiter(presets[preset]);
}
