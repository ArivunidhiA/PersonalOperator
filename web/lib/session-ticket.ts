import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * A signed, short-lived ticket minted when a call starts. Every call-scoped
 * endpoint (tools, finish, transcript email) requires it, so none of them can
 * be driven by a random script without first passing the session route's rate
 * limits. Identity (signed-in user id / verified email) only ever comes from
 * here, never from the request body.
 */
export type SessionTicket = {
  sid: string; // session id
  p: "gemini" | "openai"; // voice provider
  uid: string | null; // Clerk user id
  em: string | null; // Clerk-verified primary email
  iat: number; // issued at (s)
  exp: number; // expires at (s)
};

const TICKET_TTL_SECONDS = 20 * 60; // call cap is 10 min; leave room for post-call

let devSecret: string | null = null;
function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  // On Vercel, serverless instances don't share memory, so a per-process secret
  // would make tickets fail across instances: require the real one.
  if (process.env.VERCEL_ENV) {
    throw new Error("SESSION_SECRET (>=32 chars) must be set on Vercel deployments");
  }
  devSecret ??= randomBytes(32).toString("hex");
  return devSecret;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const sign = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");

export function newSessionId(): string {
  return `s_${Date.now().toString(36)}_${randomBytes(9).toString("base64url")}`;
}

export function mintTicket(t: Omit<SessionTicket, "iat" | "exp">, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const body = b64(JSON.stringify({ ...t, iat, exp: iat + TICKET_TTL_SECONDS }));
  return `${body}.${sign(body)}`;
}

export function verifyTicket(token: string | null | undefined, now = Date.now()): SessionTicket | null {
  if (!token || typeof token !== "string" || token.length > 2048) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const t = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionTicket;
    if (typeof t.sid !== "string" || typeof t.exp !== "number") return null;
    if (t.exp < Math.floor(now / 1000)) return null;
    return t;
  } catch {
    return null;
  }
}

/** Reads the ticket from the x-session-ticket header (or a body field for sendBeacon). */
export function ticketFrom(req: Request, bodyTicket?: unknown): SessionTicket | null {
  const header = req.headers.get("x-session-ticket");
  return verifyTicket(header ?? (typeof bodyTicket === "string" ? bodyTicket : null));
}
