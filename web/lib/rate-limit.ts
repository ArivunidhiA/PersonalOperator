import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createLogger } from "./logger";

const log = createLogger({ tool: "rate-limit" });

/**
 * Redis (Upstash) backs the limits and small caches. If it's unreachable, calls
 * must still work and must not get slower: the client doesn't retry, a circuit
 * breaker skips Redis for a minute after a failure, and an in-memory limiter
 * (per serverless instance) stands in. The old code let a deleted Upstash
 * database turn every call into a 500.
 */
let redis: Redis | null | undefined;
let redisDownUntil = 0;

/** Vercel's Upstash integration injects KV_REST_API_*; older setups use UPSTASH_REDIS_REST_*. */
function redisEnv() {
  return {
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}

export function getRedis(): Redis | null {
  if (Date.now() < redisDownUntil) return null;
  if (redis === undefined) {
    const { url, token } = redisEnv();
    redis = url && token ? new Redis({ url, token, retry: { retries: 0 } }) : null;
  }
  return redis;
}

export function markRedisDown(err: unknown) {
  if (Date.now() >= redisDownUntil) {
    log.error("Redis unreachable; using in-memory limits for 60s", { error: err instanceof Error ? err.message : String(err) });
  }
  redisDownUntil = Date.now() + 60_000;
}

/** Wrap a Redis call: fast timeout, trips the breaker on failure, returns fallback. */
export async function safeRedis<T>(fn: (r: Redis) => Promise<T>, fallback: T, timeoutMs = 800): Promise<T> {
  const r = getRedis();
  if (!r) return fallback;
  try {
    return await Promise.race([
      fn(r),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("redis timeout")), timeoutMs)),
    ]);
  } catch (err) {
    markRedisDown(err);
    return fallback;
  }
}

type Spec = { max: number; windowMs: number; make: () => ReturnType<typeof Ratelimit.slidingWindow> };
const LIMITS = {
  sessionAnon: { max: 6, windowMs: 3600_000, make: () => Ratelimit.slidingWindow(6, "1 h") }, // per IP
  sessionUser: { max: 15, windowMs: 3600_000, make: () => Ratelimit.slidingWindow(15, "1 h") }, // per user
  sessionGlobal: {
    max: Number(process.env.DAILY_SESSION_CAP || 200),
    windowMs: 86400_000,
    make: () => Ratelimit.fixedWindow(Number(process.env.DAILY_SESSION_CAP || 200), "1 d"),
  },
  toolCall: { max: 40, windowMs: 600_000, make: () => Ratelimit.slidingWindow(40, "10 m") }, // per session
  finish: { max: 8, windowMs: 3600_000, make: () => Ratelimit.fixedWindow(8, "1 h") }, // per session (snapshots + final + retry)
  notifyDaily: { max: 60, windowMs: 86400_000, make: () => Ratelimit.fixedWindow(60, "1 d") }, // Ariv's inbox
  emailTranscript: { max: 3, windowMs: 86400_000, make: () => Ratelimit.fixedWindow(3, "1 d") }, // per user
  // Paid fallback: hard daily ceiling across everyone.
  openaiDaily: {
    max: Number(process.env.OPENAI_DAILY_SESSION_CAP || 30),
    windowMs: 86400_000,
    make: () => Ratelimit.fixedWindow(Number(process.env.OPENAI_DAILY_SESSION_CAP || 30), "1 d"),
  },
  shareView: { max: 60, windowMs: 600_000, make: () => Ratelimit.slidingWindow(60, "10 m") }, // per IP
  track: { max: 120, windowMs: 600_000, make: () => Ratelimit.slidingWindow(120, "10 m") }, // analytics events per IP
} satisfies Record<string, Spec>;

export type LimitName = keyof typeof LIMITS;
export type LimitResult = { ok: boolean; reset?: number; reason?: string };

const limiters = new Map<LimitName, Ratelimit>();
const memory = new Map<string, { count: number; resetAt: number }>();

function memoryLimit(name: LimitName, key: string): LimitResult {
  const { max, windowMs } = LIMITS[name];
  const k = `${name}:${key}`;
  const now = Date.now();
  const cur = memory.get(k);
  if (!cur || cur.resetAt <= now) {
    memory.set(k, { count: 1, resetAt: now + windowMs });
    if (memory.size > 5000) for (const [mk, v] of memory) if (v.resetAt <= now) memory.delete(mk);
    return { ok: true, reset: now + windowMs };
  }
  cur.count++;
  return { ok: cur.count <= max, reset: cur.resetAt };
}

/** True when a shared Redis answered (not the per-instance fallback). */
export function redisHealthy(): boolean {
  return !!getRedis();
}

export async function checkLimit(name: LimitName, key: string): Promise<LimitResult> {
  const { url, token } = redisEnv();
  const configured = !!(url && token);
  if (!configured && process.env.VERCEL_ENV === "production") {
    // Never run the public site without shared limits configured.
    log.error("Rate limiting not configured in production; refusing", { name });
    return { ok: false, reason: "unconfigured" };
  }
  const r = getRedis();
  if (!r) return memoryLimit(name, key);
  let limiter = limiters.get(name);
  if (!limiter) {
    limiter = new Ratelimit({ redis: r, limiter: LIMITS[name].make(), prefix: `rl:${name}`, analytics: false, timeout: 1000 });
    limiters.set(name, limiter);
  }
  try {
    const { success, reset, reason } = await limiter.limit(key);
    // Ratelimit resolves with reason "timeout" instead of throwing when Redis hangs.
    if (reason === "timeout") {
      markRedisDown(new Error("ratelimit timeout"));
      return memoryLimit(name, key);
    }
    return { ok: success, reset };
  } catch (err) {
    markRedisDown(err);
    return memoryLimit(name, key);
  }
}

/**
 * The caller's IP as seen by Vercel's edge (not spoofable there). IPv6 is keyed
 * by its /64, since one person usually controls a whole /64.
 */
export function clientIp(req: Request): string {
  const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!ip.includes(":")) return ip;
  const parts = ip.split("::")[0].split(":").filter(Boolean);
  return `${parts.slice(0, 4).join(":")}::/64`;
}
