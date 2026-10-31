# Known risks

| ID | Risk or prior defect | Impact | Detection method | Regression coverage |
|---|---|---|---|---|
| R-01 | Owner flag is client-supplied and spoofable | A visitor can claim owner mode and get owner-only behaviour/quota | Review of `/api/voice/session` request handling; direct POST with owner flag | Partial: `web/__tests__/routes-security.test.ts` (session limits); owner flag not server-verified: open |
| R-02 | Share tokens never expire | A leaked `/call/[token]` link exposes a transcript forever | Manual review of `/call/[token]`; DB check for `share_token` with no expiry | `web/__tests__/routes-security.test.ts` "share pages" (noindex, malformed tokens only); no expiry test: open |
| R-03 | Quota drain via session loop | Scripted session minting burns the daily Gemini cap (`DAILY_SESSION_CAP`) | Rate-limit logs; `sessionGlobal` counter near cap; uptime/analytics | `web/__tests__/routes-security.test.ts` "denied requests don't consume global quota", "refuses without shared Redis" |
| R-04 | Finish-lock fallback double processing (Redis down: lock always "won") | Snapshot + final save run concurrently; duplicate emails/summaries | Duplicate rows in `calls`; Redis-down logs | `web/__tests__/lock-report.test.ts` (`withLock` in-memory exclusion); route adoption pending (po-security) |
| R-05 | Fabricated assistant lines in browser-assembled transcripts | A client can submit invented "agent" lines that get shared | Fact-check of agent lines in finish | `web/__tests__/routes-security.test.ts` "refuses to share when the 'agent' lines fail the fact check"; `web/__tests__/verifier.test.ts` |

## Review checklist
- Strix (see `docs/qa/strix.md`, po-security) runs only against preview deployments, never production.
