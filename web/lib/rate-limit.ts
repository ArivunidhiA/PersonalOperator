import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

function createRateLimiter() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  return new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(10, "60 s"),
    analytics: true,
    prefix: "ratelimit:realtime",
  });
}

let _rateLimiter: Ratelimit | null | undefined;

export function getRateLimiter(): Ratelimit | null {
  if (_rateLimiter === undefined) {
    _rateLimiter = createRateLimiter();
  }
  return _rateLimiter;
}
