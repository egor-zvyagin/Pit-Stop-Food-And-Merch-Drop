/**
 * Token-bucket rate limiting, per client and per route.
 *
 * Each client (by IP address) gets its own bucket, so one busy or abusive
 * client cannot use up the limit for everyone else. A larger shared bucket
 * per route still caps the total, in case a client rotates addresses.
 *
 * Buckets live in this server instance's memory, so on serverless hosting
 * each instance keeps its own counts: the limit is best-effort, not exact.
 *
 * Rate limiting is skipped in tests (NODE_ENV === 'test' or VITEST set)
 * unless RATE_LIMIT_IN_TESTS is set, which the limiter's own tests use.
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

/** Clients tracked per route before the least recently used are dropped. */
const MAX_TRACKED_CLIENTS = 5000;

class Bucket {
  tokens: number;
  lastRefillMs: number;

  constructor(private readonly options: RateLimiterOptions) {
    this.tokens = options.capacity;
    this.lastRefillMs = Date.now();
  }

  take(): boolean {
    const now = Date.now();
    const elapsed = (now - this.lastRefillMs) / 1000;
    this.tokens = Math.min(this.options.capacity, this.tokens + elapsed * this.options.refillRatePerSecond);
    this.lastRefillMs = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/**
 * The client's address. Amplify Hosting sits behind CloudFront, which puts
 * the viewer's address first in X-Forwarded-For. A client can add its own
 * entries, so this is good enough to separate ordinary clients, not to
 * identify an attacker; the shared bucket covers that case.
 */
export function clientKey(request?: Request | { headers: Headers }): string {
  if (!request) return 'unknown';
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || request.headers.get('x-real-ip') || 'unknown';
}

export class TokenBucketRateLimiter {
  private readonly perClient = new Map<string, Bucket>();
  private readonly shared: Bucket;

  constructor(
    private readonly options: RateLimiterOptions,
    /** The route-wide bucket is this many times larger than a client's. */
    sharedMultiplier = 50
  ) {
    this.shared = new Bucket({
      capacity: options.capacity * sharedMultiplier,
      refillRatePerSecond: options.refillRatePerSecond * sharedMultiplier,
    });
  }

  /** Take one token for this request's client. */
  consume(request?: Request | { headers: Headers }): RateLimitResult {
    if ((process.env.NODE_ENV === 'test' || process.env.VITEST) && !process.env.RATE_LIMIT_IN_TESTS) {
      return { allowed: true };
    }

    const key = clientKey(request);
    let bucket = this.perClient.get(key);
    if (bucket) {
      // Re-insert so the Map's order tracks recent use.
      this.perClient.delete(key);
    } else {
      bucket = new Bucket(this.options);
      if (this.perClient.size >= MAX_TRACKED_CLIENTS) {
        const oldest = this.perClient.keys().next().value;
        if (oldest !== undefined) this.perClient.delete(oldest);
      }
    }
    this.perClient.set(key, bucket);

    if (bucket.take() && this.shared.take()) {
      return { allowed: true };
    }

    const retryAfterSecs = Math.ceil(1 / this.options.refillRatePerSecond);
    return {
      allowed: false,
      response: NextResponse.json(
        {
          success: false,
          error: 'Too many requests. Wait a moment and try again.',
          retryAfterSeconds: retryAfterSecs,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfterSecs),
            'X-RateLimit-Limit': String(this.options.capacity),
            'X-RateLimit-Remaining': '0',
          },
        }
      ),
    };
  }
}

/**
 * Presets, per client:
 * - 'standard': 20 burst, 10/s (reads and polling)
 * - 'orders':   10 burst, 2/s  (placing orders and payments)
 * - 'vendor':   30 burst, 15/s (staff terminal)
 */
export function createRateLimiter(
  preset: 'standard' | 'orders' | 'vendor' = 'standard'
): TokenBucketRateLimiter {
  const presets: Record<string, RateLimiterOptions> = {
    standard: { capacity: 20, refillRatePerSecond: 10 },
    orders: { capacity: 10, refillRatePerSecond: 2 },
    vendor: { capacity: 30, refillRatePerSecond: 15 },
  };
  return new TokenBucketRateLimiter(presets[preset]);
}
