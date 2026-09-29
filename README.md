# Ariv's AI

A voice agent that talks to people about me (Ariv). Recruiters and curious visitors open [arivsai.app](https://arivsai.app), hit **Start talking**, and have a real conversation: what I'm working on, what I've built, whether I'd fit a role, and a link to book 15 minutes with me. It says it's an AI, it only says true things, and it runs on free tiers.

## How it works

```
Browser (Next.js page)
  │ 1. POST /api/voice/session  → rate limits, region check, signed call ticket
  │                              + single-use Gemini token with the prompt/tools locked in
  │ 2. WebSocket (audio) ───────────────────────────────►  Gemini Live (gemini-3.8-live)
  │      mic 16 kHz PCM  ─►        ◄─ 24 kHz speech + transcripts + tool calls
  │ 3. tool calls → POST /api/tools/execute (ticket required)
  │      retrieve_knowledge · research_role · check_availability
  │      schedule_meeting · share_links · generate_summary
  │ 4. call ends → POST /api/calls/finish (ticket) → Supabase + summary + email to me
  │    (optional) POST /api/calls/share → opt-in, fact-checked, unverified-labeled share link
  │ 5. page views + link clicks → POST /api/track → site_events (first-party analytics)
  ▼          /dashboard (me only): who visited, from where, what they asked, clicked, booked
Vercel (Hobby) · Supabase (Postgres) · Upstash (rate limits) · Clerk (optional sign-in)
Resend (my notification + "email me the transcript") · Calendly (open slots, bookings)
IPinfo (which network a visitor is on; optional free token)
```

- **One source of truth for facts.** Everything the agent may say about me lives in [`web/lib/knowledge.ts`](web/lib/knowledge.ts). The prompt inlines it, so most answers need no tool call and no retrieval round trip. `retrieve_knowledge` searches the same registry in memory, and `npm run kb:seed` mirrors it into Supabase.
- **Fast by default, checked afterwards** (the "System 1" idea from TypeSafe's Jev). The realtime model answers straight from the fact card, and plain code in [`web/lib/verifier.ts`](web/lib/verifier.ts) checks every line it said, including invented numbers, wrong titles, "I'm human", spoken URLs and confidential names. Flags show up in the call notification.
- **Locked session.** The browser gets a single-use Gemini token whose prompt and tools are fixed on the server, so a visitor can't rewrite the agent.
- **Least privilege.** No tool can email anyone or read another caller's data. Personal data never goes through the model. Links reach the chat as structured cards, so the agent never reads a URL aloud.
- **Four call modes** (greeter, role researcher, scheduler, closer) live in one prompt, so no rule or tool disappears mid-call. The UI shows the active mode.

## Cost

$0 at current traffic: Gemini API free tier (voice, role research, summaries), Vercel Hobby, and the free tiers of Supabase, Upstash, Clerk, Resend and Calendly.

The Gemini free tier has some catches:
- Google may use free-tier calls to improve its models. The page tells visitors this.
- It can't serve the EEA, the UK or Switzerland. Those visitors see my links instead, unless the paid OpenAI fallback is enabled.
- Its rate limits aren't published. `DAILY_SESSION_CAP` protects them.

Optional paid paths, both off by default:
- OpenAI Realtime (`VOICE_FALLBACK=openai`, `gpt-realtime-2.1-mini`).
- Claude via [Vercel AI Gateway's Anthropic Messages API](https://vercel.com/docs/ai-gateway/sdks-and-apis/anthropic-messages-api) (`AI_GATEWAY_API_KEY`, `LLM_PROVIDER=gateway`).

## Personality

It's meant to sound like someone who actually knows me, not an assistant, and to close like Harvey Specter: one sharp question about what you need, real evidence, then an offer to put 15 minutes on my calendar. No hype, no fake urgency, no invented numbers. `web/lib/system-prompt.ts` sets the persona, the answer shape (answer, evidence, personality, stop), the spoken style and the humor rules (answer first, joke second, never at anyone's expense, a straight face for visa, salary and confidential stuff). My own answers are in [`docs/voice/ARIV_ANSWERS.md`](docs/voice/ARIV_ANSWERS.md). It still says it's an AI whenever asked, and the evals fail any reply that sounds like a generic assistant ("great question", "feel free to", "anything else?"). The voice is Gemini's prebuilt `Zubenelgenubi`; you can change it with `GEMINI_VOICE`. Every model turn re-sends the prompt on the free tier, so it stays under 20k characters.

## Analytics (for me)

`/dashboard` (my Clerk account only) shows each visitor: rough location and network owner (from the IP, which is never stored), how they found the site, device, how often they came back, what they said on a call and who they said they are, which links they clicked, and whether they booked on Calendly (booking links carry UTM tags, so a booking matches its call). Each call also sends me an email with the same details. Names and companies only ever come from the visitor: what they say, a sign-in, or a booking. Nothing identifies people behind their back. My own browser (after I open the dashboard) and headless test browsers are left out of the numbers. Visitors in the EEA, UK and Switzerland stay anonymous, browsers with Global Privacy Control or Do Not Track aren't tracked, and everything is deleted after `RETENTION_DAYS`. Set `IPINFO_TOKEN` (free at ipinfo.io) for reliable network lookups.

## Run it

```bash
cd web
npm ci
vercel env pull .env.local        # or copy .env.example and fill it in
npm run dev
```

Node 22+ (Vercel uses 24). Env vars are documented in [`web/.env.example`](web/.env.example).

**Database:** run [`web/scripts/migrate-v3.sql`](web/scripts/migrate-v3.sql) and then [`web/scripts/migrate-v4.sql`](web/scripts/migrate-v4.sql) once each in the Supabase SQL editor. v3 turns on row-level security, creates `conversations`, adds a unique index per call and drops the unused vector indexes; v4 adds `site_events` and the per-call analytics columns.

## Tests

| Command | What it proves |
|---|---|
| `npm test` | 190+ unit/route/UI tests. Facts registry, prompt rules, verifier (seeded with lines the old agent really said), tickets, tool least-privilege, booking links, transcript ordering, provider/region choice, route auth, analytics tracking and privacy rules, the dashboard. |
| `npm run eval:live` | Red-team evals on the **real** voice model through the production token path (AI disclosure, prompt injection, confidentiality, false premises, invented numbers, URL reading, email/memory abuse, visa, scheduling and booking a real slot, the close, weaknesses, experience objections, privacy, prompt leaks). Repeats each case; deterministic checks only. Costs nothing on the Gemini free tier. |
| `npm run test:e2e` | A real browser call. Chrome's fake microphone plays a scripted caller (`e2e/make-audio.sh`). The test checks the greeting, the correct answer, the links card, the tagged booking link and its click, the saved transcript and the share link, the analytics rows in Supabase, plus security probes and headers. |
| `npm run kb:verify` | Read-only check that Supabase `knowledge_base` matches `lib/knowledge.ts`. |

CI runs lint, typecheck, tests, `npm audit` (prod, high+) and a production build on Node 24.

## Updating what the agent knows

Edit [`web/lib/knowledge.ts`](web/lib/knowledge.ts). Only add true things, and add any new number to `ALLOWED_NUMBERS`. Then:

```bash
npm test && npm run eval:live && npm run kb:seed
```

## Repo map

- `web/lib/knowledge.ts`: facts, links, search
- `web/lib/system-prompt.ts`: the one prompt
- `web/lib/agents.ts`: call modes
- `web/lib/tools.ts`: tool schemas
- `web/lib/tool-executor.ts`: tool logic, all input untrusted
- `web/lib/voice-config.ts`: engines, models, voice, VAD, region rules
- `web/lib/voice/`: browser clients (Gemini WebSocket plus worklets, OpenAI WebRTC fallback), transcript reducer
- `web/app/api/voice/session`: starts a call
- `web/app/api/tools/execute`: runs tools
- `web/app/api/calls/*`: finish (save-or-update), share (opt-in), [token] (share view), email
- `web/app/api/cron/maintenance`: daily housekeeping (retention)
- `web/app/api/track`, `web/lib/visitor.ts`, `web/lib/track-client.ts`: first-party analytics
- `web/app/api/analytics`, `web/lib/analytics-report.ts`, `web/lib/calendly.ts`, `web/app/dashboard`: my dashboard
- `web/evals/`, `web/e2e/`: live evals and the browser call test
- `docs/qa/`: QA profile and release reports
