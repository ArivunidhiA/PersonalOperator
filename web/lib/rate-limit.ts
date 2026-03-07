import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

function createRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

let _authLimiter: Ratelimit | null | undefined;
let _anonLimiter: Ratelimit | null | undefined;

/** Signed-in users: 10 sessions per minute */
export function getRateLimiter(): Ratelimit | null {
  if (_authLimiter === undefined) {
    const redis = createRedis();
    _authLimiter = redis
      ? new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(10, "60 s"),
          analytics: true,
          prefix: "ratelimit:realtime:auth",
        })
      : null;
  }
  return _authLimiter;
}

/** Anonymous users: 3 sessions per hour (stricter) */
export function getAnonymousRateLimiter(): Ratelimit | null {
  if (_anonLimiter === undefined) {
    const redis = createRedis();
    _anonLimiter = redis
      ? new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(3, "1 h"),
          analytics: true,
          prefix: "ratelimit:realtime:anon",
        })
      : null;
  }
  return _anonLimiter;
}
