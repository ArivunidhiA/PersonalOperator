/**
 * Cloudflare Turnstile (free bot check) on call start. Fails open when
 * TURNSTILE_SECRET_KEY is unset, so local dev and previews work without it.
 */
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(token: string | null, ip?: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token || token.length > 2048) return false;
  try {
    const form = new URLSearchParams({ secret, response: token });
    if (ip) form.set("remoteip", ip);
    const res = await fetch(VERIFY_URL, { method: "POST", body: form, signal: AbortSignal.timeout(4000) });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    // Cloudflare unreachable: don't lock real visitors out; rate limits still apply.
    return true;
  }
}
