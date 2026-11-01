# W1 findings, frozen before any source edit (2026-10-31, base d3bf74a)

Method: `gemini-3.8-live` through the real locked token and constrained endpoint. Caller audio is macOS `say` rendered to wav and streamed as 32 ms PCM frames, silently. History seeded from the production record of the call. Traces here have audio stripped and handles scrubbed. Ariv's production record has text only (no event log), so which path hit him is inferred, not observed.

| ID | Sev | Repro | Finding | Evidence |
|---|---|---|---|---|
| F-1 | High | FLAKY, 2/4 at base config | On a long turn then "Hello. Hello.", server VAD keeps the turn open through 3 s silences. First reply 9.3 s and 12.0 s after the long turn ended. The other 2/4: 0.9 s, 1.5 s | trace-b1f1, b1f2, v_base1 |
| F-2 | High | 13.92 s in both traced runs | Speech past about 14 s is force-ended and a new activity opens at once. No reply to the first part. Transcript arrives only at END, so during the hold the client sees nothing | trace-b1f1, b1f2 |
| F-3 | High | Certain from code | Watchdog waits 8 s and re-arms on each transcript, so "Hello?" gets no reaction inside a normal caller's patience. One nudge only: `nudged` stays true if it fails. If `speaking` at fire time it gives up without re-arming. Under 3 words is ignored, so "Hello." never counts | gemini.ts:163-176 |
| F-4 | High | 1/12 unprompted (doubtful "I don't know" after "you've heard enough"), 12/12 no reply when forced | Model calls `generate_summary` instead of answering, with no speech. Client clears the watchdog on the tool call and never re-arms; the empty turnComplete then moves `lastModelOutput`. Removing SILENT does not help: no reply 3/3, and 2/3 emitted junk text ("<!-- generator: stop -->", a zero-width char). A nudge got a reply 6/6 in 0.8 to 2.1 s | trace-call1, p_nudge |
| F-5 | Medium | 2/2 | `audioStreamEnd` with mic frames still flowing forces END within 0.2 s, so the hold in F-1 can be bounded from the client | trace-k_gate1 |
| F-6 | High | Certain | Resumption is not implemented; goAway and 1011 end the call | gemini.ts:336-358 |
| F-7 | High | 3/3 | Docs are wrong for the constrained endpoint: a `uses: 1` token reconnect closes 1011 "Token has been used too many times". After 60 s: "new_session_expire_time deadline exceeded". `uses: 4` with a long window connects | probes |
| F-8 | High | 1/1 + 4 traces | Only one resumption handle arrives, at setup, in 60 s sessions. Resuming with it lost the context. A bogus handle also gets setupComplete, so success proves nothing. Re-seeding text history with `clientContent` restored context 1/1 | probes |
| F-9 | Low | NOT reproduced, 0/5 calls + 0 in about 20 traces | Duplicate sentence after a tool call. No production record has it (2 rows retained). Pre-tool line plus post-tool line is normal; the model restating itself is the likely cause (hypothesis) | p_dup |
| F-10 | Low | 1/1 vs baseline | `customVocabulary` is accepted through the token; "Ariv" heard correctly, baseline heard "Arav" | trace-k_vocab, tool1 |

## Found after the fix, in the real-browser check
| ID | Severity | Repro | Finding |
|---|---|---|---|
| F-11 | Medium | 1/1 | A socket closed with code 1000 that the app did not start ends the call as a hang-up, with no reconnect. The app ends real hang-ups itself, so an unexpected 1000 is a drop. Forced in Chromium 141 with `close(4000)`, which came back as 1000. Whether the server ever sends this unprompted is unknown. |

## VAD (item 7)
Long turn plus check-ins, 2 runs each, speech end to first output. Transcript complete in all.

| Config | Run 1 | Run 2 | Earlier runs | Activity splits |
|---|---|---|---|---|
| LOW / 800 (current) | 1.5 | 0.9 | 9.3, 12.0 | 2 to 3 |
| HIGH / 800 | 1.5 | 1.7 | | 4 |
| HIGH / 500 | 1.2 | 1.1 | | 4 |
| LOW / 500 | 1.3 | 1.4 | | 3 to 4 |
| LOW / 800 + end signal at 1.5 s | 1.5 | 1.4 | | 4 |

Small sample; the 9 to 12 s runs were in a batch with other sessions on the key, so the base rate is uncertain. Lower silence gives no latency win and more splits.

## Oracle gaps
- How long may a caller wait? Used: under 2 s target from QA_PROFILE, recovery starts at 3.5 s, 2 s for check-ins.
- Whether Ariv's call hit F-1, F-2 or F-4 cannot be determined from the record.

## For W2
F-4: the model treats a doubtful caller as wrapping up. `generate_summary` should fire only on an explicit goodbye.

## Real-browser results after the fix (added 2026-10-31, not part of the frozen set)
Production build on localhost, Chromium 141.0.7390.37 with a muted fake mic, live `gemini-3.8-live`. One run each. Playwright's own Chromium 1208 was incomplete, so this is the cached older build.

| Scenario | Result | Trace |
|---|---|---|
| Long disfluent turn, then "Hello?" twice | PASS: full turn kept, reply at the `audioStreamEnd`, both "Hello" answered | browser-stall.json |
| Injected 1011 at 28 s | PASS: new socket in 0.4 s, setup in 0.9 s, same token and handle. Then "What did I just ask you about?" answered correctly | browser-drop-1011.json |
| Forced close at 28 s, before F-11 fix | FAIL: call ended as a hang-up | browser-drop-before-f11.json |
| Forced close at 74 s, after F-11 fix | PASS: reconnected in 1.1 s, past the old 60 s token limit, context re-seeded | browser-drop-1000-at-74s.json |

## Turn latency (item 12), speech end to first output, seconds
| | Normal turn | Worst seen |
|---|---|---|
| Before (LOW/800, 4 runs) | 0.9, 1.5 | 9.3, 12.0 |
| After (same replay, 2 runs) | 1.4, 1.5 | 1.5 |

Normal turns are not faster, and the end signal waits 1.5 s of caller silence by design. The gain is the worst case. Small sample and a flaky baseline, so this does not prove a rate. In the browser, server activity end to first output was 0.0 to 0.3 s over 9 turns.
