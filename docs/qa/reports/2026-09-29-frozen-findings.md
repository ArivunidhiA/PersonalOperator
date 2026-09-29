# Frozen findings: links, calendar and messaging smoke check (2026-09-29)

Recorded before any fix, per `AGENTS.md` §11. Baseline = production as deployed on 2026-09-29
(`personal-operator-mv97c6pii`, commit `4deb444`, same content as `origin/main` 8a7925e).

## F-01: Booking card opens Calendly's form for 12:00am instead of the slot the caller picked

- Severity: critical (breaks the last step of release-blocking journey J-03)
- Confidence: confirmed
- Reproducibility: always (2 of 2 dates tried: 2026-09-30, 2026-10-01)
- Affected promise: P-04 / J-03 ("booking card links to Calendly" for the slot the caller picked)
- Starting state: any live call; caller asks to book, picks an offered slot
- Reproduction:
  1. `schedule_meeting` with a slot from `check_availability`, e.g. 2026-09-30T19:30:00Z (3:30pm ET).
  2. The card's "Confirm on Calendly" URL is `https://calendly.com/annaarivan-a-northeastern/15-min-coffee-chat/2026-09-30?month=2026-09&date=2026-09-30`.
  3. Open it in a browser (headless Chromium, America/New_York).
- Expected: Calendly shows the picked time (3:30pm) or that day's open times. Source: `lib/tools.ts` schedule_meeting description and the card text "Pick 3:30 PM ET on the booking page".
- Actual: Calendly reads the bare date in the path as a time and opens "Enter Details" for **12:00am - 12:15am, Wednesday, September 30, 2026**, a time Ariv isn't available.
- Build/env: production code path (`lib/tool-executor.ts` scheduleMeeting), live Calendly.
- Impact: a recruiter who asks to book lands on a form for midnight; they either give up or try to book a time that isn't offered.
- Evidence: `docs/qa/evidence/2026-09-29/calendly-old-card-link-live-.png` (midnight form), `calendly-direct-slot-link.png` (same slot as `/2026-09-30T15:30:00-04:00` opens 3:30pm correctly).
- Suspected failing boundary (hypothesis): URL format. Calendly's path segment after the event slug is a start time; the query-only form (`?month=&date=`) shows the day's times (22 buttons seen).
- Blocks further testing: no.

## F-02: Portfolio site arivfolio.tech is down

- Severity: minor (outside the agent)
- Confidence: confirmed; Reproducibility: always
- Evidence: `curl` gets no response (status 000) from https://arivfolio.tech. Ariv's X bio links to it, and the 2026-09-29 answer sheet says his resume is "available through the portfolio".
- Impact: the agent must keep saying Ariv is happy to email his resume (it does); the X bio link is dead.
- Not fixed here: ORACLE GAP until Ariv says whether the portfolio is coming back.

## F-03: Owner notification delivery can't be verified end to end

- Severity: major (evidence gap, not a known failure)
- Confidence: n/a (BLOCKED)
- Notifications go to `annaarivan.a@northeastern.edu` (`ARIV_NOTIFY_EMAIL` unset). The Resend key is send-only (`restricted_api_key`), so delivery status can't be read, and the success path didn't log the Resend email id.
- Mitigation applied later (repair phase): the finish route logs `notified {emailId}` on success, so Vercel logs show Resend accepted the message. Inbox delivery still needs Ariv to confirm.

## Links that passed the baseline

| Link | Check | Result |
|---|---|---|
| LinkedIn `/in/arivunidhi-anna-arivan/` | real Chrome | "Arivunidhi Anna Arivan \| LinkedIn" |
| GitHub `ArivunidhiA` | HTTP + API | 200, public |
| X `@Ariv_2012` | real Chrome | profile "Arivunidhi A" loads |
| forecost repo, voice-agent repo, Ralph Loop Arena repo | GitHub API | public, not archived |
| forecost on PyPI | PyPI JSON | forecost 0.1.1 by Arivunidhi A |
| Calendly event (`15-min-coffee-chat`) | API + headless Chromium | active, 15 min, 146 open slots in 7 days; page renders |
| Email (`mailto:`) | format | valid |
