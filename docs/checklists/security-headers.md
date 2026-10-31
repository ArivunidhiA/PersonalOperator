# Security headers checklist

Verified 2026-10-30 against `next build && next start` on localhost:3111 (curl + Browser pane).

## [5] Full CSP (`web/next.config.ts`)
- [x] Code: full CSP incl. Turnstile (`challenges.cloudflare.com` in script/frame/connect), Gemini wss, Clerk, Vercel vitals, `worker-src 'self' blob:`
- [x] Nonces evaluated: infeasible from `next.config` (needs middleware nonce injection, which forces dynamic rendering; Clerk/Next inline bootstrap scripts). Used `'unsafe-inline'` for script-src; reason in code comment. Revisit if middleware gains a nonce.
- [ ] Test added: none (header config; no unit test harness for next.config). Verified manually instead.
- [x] Docs/env: this file; no env vars needed. Dev adds `'unsafe-eval'` and localhost ws only when `NODE_ENV !== production`.
- [x] Verified: curl shows header on `/`; home page loads in browser with zero console errors and zero `securitypolicyviolation` events; `audioWorklet.addModule` succeeds for `/audio/pcm-capture.js` and `/audio/pcm-player.js`.
- [ ] NOT verified: live Gemini websocket, Clerk (no keys locally), Turnstile widget, Vercel vitals. Check in preview deploy console after merge.

## [8] noindex `/call/[token]`
- [x] Code: `metadata.robots` already present in `web/app/call/[token]/layout.tsx` (unchanged); added `X-Robots-Tag: noindex, nofollow` rule for `/call/:path*`.
- [ ] Test added: none.
- [x] Docs: this file.
- [x] Verified: `curl -I /call/x` returns `X-Robots-Tag: noindex, nofollow`.

## [14] COOP / CORP
- [x] Code: `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`.
- [ ] Test added: none.
- [x] Docs: this file.
- [x] Verified: headers present via curl.
- [ ] NOT verified: Clerk popup sign-in (no Clerk keys locally). No `popup` usage in app code; Clerk defaults to redirect. If a popup/OAuth flow breaks, change COOP to `same-origin-allow-popups`.

## [16] security.txt + SECURITY.md
- [x] Code: `web/public/.well-known/security.txt` (Expires 2027-10-30), root `SECURITY.md`.
- [ ] Test added: none.
- [x] Docs: SECURITY.md is the policy URL.
- [x] Verified: `curl /.well-known/security.txt` serves the file. Renew `Expires` before 2027-10-30.
