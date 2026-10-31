# Production smoke

`web/scripts/smoke-lightpanda.mjs` (hourly via `.github/workflows/smoke.yml`, or run by hand):

- every https URL in `LINKS` (lib/knowledge.ts) returns 2xx/3xx (LinkedIn and X block bots: warn only)
- `GET /` carries the security headers from next.config.ts and no `x-powered-by`
- retired endpoints (`/api/voice/token`, `/api/chat`, `/api/realtime`, `/api/voice/gemini-token`) return 404
- `/call/<unknown token>` renders; with CDP it waits for the "not found" state in a real DOM

```
SMOKE_BASE_URL=https://www.arivsai.app node scripts/smoke-lightpanda.mjs
CDP_URL=ws://127.0.0.1:9222 node scripts/smoke-lightpanda.mjs   # with `lightpanda serve`
```

Fallback: the workflow downloads the Lightpanda nightly binary best-effort. If it cannot download or
start (nightly asset moved, runner incompatibility) or the CDP connect fails, the script warns and
runs the fetch-only equivalent (page shell 200 + `/api/calls/<token>` 404), so the job still gates.
Against a local build without Supabase configured, `/api/calls/<token>` returns 503, not 404.

Like uptime.yml, this needs Actions minutes.
