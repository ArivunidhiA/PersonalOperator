# Uptime monitoring

`GET https://www.arivsai.app/api/health` returns 200 `{status:"ok",checks:{supabase,redis,gemini}}`
or 503 `{status:"degraded",...}`. It checks Supabase reachability (one head query), Redis ping
(unconfigured Redis is tolerated; configured-but-down is not) and that `GEMINI_API_KEY` is set.
It never mints a token and never calls Gemini.

## GitHub Actions (`.github/workflows/uptime.yml`)
Runs every 30 min and on demand; a non-200 fails the run with an `::error` annotation, which
emails the repo owner via GitHub's failed-workflow notifications.

Caveat: this uses Actions minutes (about 1,440 runs/month at roughly 10 s each). Minutes are shared
across projects and have run out before; when they do, scheduled runs fail or never start, so this
monitor goes quiet. Do not treat silence as health.

## UptimeRobot alternative (no Actions minutes)
1. Create a free UptimeRobot account, add a monitor: type HTTP(s), URL `https://www.arivsai.app/api/health`, interval 5 min.
2. Under advanced settings add keyword monitoring for `"status":"ok"` (alerts when absent) so a 503 body is caught too.
3. Add an email (or Slack/Telegram) alert contact.
Using both is fine; they fail independently.
