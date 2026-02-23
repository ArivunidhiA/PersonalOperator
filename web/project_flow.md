# Project Flow — Ariv's AI Voice Agent

## The Idea

I wanted to build something that goes beyond a static portfolio. Recruiters skim resumes for 6 seconds. I thought — what if instead of a PDF, they could just *talk* to someone who knows me? Not a chatbot with canned responses, but a real-time voice agent that sounds like a friend who genuinely knows my work, can answer questions on the fly, research role fit, share links, and even book a meeting. That's the core idea behind Ariv's AI.

The goal was simple: a recruiter lands on [arivsai.app](https://arivsai.app), clicks the orb, and has a natural voice conversation about me. No forms, no scrolling, no reading. Just talk.

---

## Architecture Decisions

### Why WebRTC + OpenAI Realtime API

I had three options for voice:

1. **Speech-to-text → LLM → text-to-speech pipeline** — The classic approach. Transcribe audio, send to GPT, synthesize response. Problem: latency. Each hop adds 200-500ms. By the time the AI responds, there's an awkward 1-2 second gap. Feels robotic.

2. **OpenAI Realtime API over WebSocket** — Lower latency, but requires a server to proxy the WebSocket connection. Adds infrastructure complexity and a potential point of failure.

3. **OpenAI Realtime API over WebRTC** — Direct browser-to-OpenAI connection. Sub-second latency. No proxy server needed. The browser handles the peer connection, audio streams directly, and tool calls come back over a DataChannel.

I went with option 3. The tradeoff is that WebRTC is more complex to set up (ICE candidates, SDP negotiation, DataChannel management), but the latency difference is night and day. When you're having a voice conversation, even 500ms of extra delay makes it feel unnatural. WebRTC eliminates that.

### Why Next.js 16 + App Router

The app needs both a frontend (React UI with the orb, transcript, etc.) and a backend (API routes for Calendly, Supabase, email, etc.). Next.js lets me colocate both in one project. I chose the App Router over Pages Router because:

- Server components reduce client bundle size
- Route handlers are cleaner than the old API routes pattern
- Middleware for auth (Clerk) is straightforward
- Vercel deployment is zero-config

### Why Supabase for RAG

I needed a vector database for knowledge retrieval. Options were Pinecone, Weaviate, Chroma, or Supabase with pgvector. I chose Supabase because:

- I was already using it for conversation storage
- pgvector is built into Postgres — no separate service to manage
- The `match_documents` RPC function handles similarity search natively
- One fewer API key, one fewer service to monitor

The tradeoff is that pgvector isn't as performant as dedicated vector DBs at scale, but for a personal portfolio with maybe 50-100 knowledge chunks, it's more than enough.

### Why Clerk for Auth

I needed authentication to prevent abuse (the OpenAI Realtime API costs money per minute). Options were NextAuth, Clerk, or rolling my own. I chose Clerk because:

- Drop-in React components (`<SignIn>`, `<UserButton>`)
- Middleware-based route protection
- Gives me the caller's name and email automatically (used for Calendly pre-fill and caller memory)
- Production-ready with minimal config

I paired it with Upstash Redis for rate limiting — each user gets a capped number of sessions to prevent someone from running up the API bill.

---

## The Build — Feature by Feature

### 1. Core Voice Loop

The foundation is the `RealtimeVoice.tsx` component (~1000 lines). It manages:

- **WebRTC connection lifecycle** — Creating the peer connection, negotiating SDP with OpenAI's `/realtime` endpoint, handling ICE candidates, managing the audio stream
- **DataChannel events** — All the real-time events (transcription deltas, audio transcript completions, tool calls) come through the DataChannel as JSON
- **Transcript state** — Messages are built up incrementally via `upsertDelta` (for streaming partial transcripts) and finalized via `finalize` (when a complete utterance is done)
- **Tool call handling** — When the AI decides to call a tool, the DataChannel fires `response.function_call_arguments.done`, I parse the args, call the appropriate API route, and send the result back

The trickiest part was the transcript management. OpenAI sends partial transcription deltas as the user speaks, and I need to merge them into coherent messages without duplicating or losing text. I use a keying system (`user:{item_id}:{content_index}`) to track which delta belongs to which message.

### 2. AI Persona Engineering

This was one of the most iterative parts. The system prompt went through probably 10+ revisions. The core challenge: making an AI sound like a real person on a phone call, not a chatbot.

**First attempt:** I wrote a straightforward prompt — "You are an AI assistant that helps recruiters learn about Ariv." It sounded exactly like what it was: a corporate chatbot reading a resume out loud.

**The fix:** I rewrote the entire tone section with explicit BAD and GOOD examples. I added rules like "3-5 sentences MAX", "use fillers naturally", "never say 'Here's the breakdown'". The key insight was that conversational AI isn't about what you tell it to say — it's about what you tell it NOT to say. Banning resume-speak was more effective than encouraging casual speech.

**The greeting problem:** Originally, the AI waited for the caller to speak first. But that created an awkward silence — the caller connects and hears nothing. I added a `response.create` event on the DataChannel's `open` event, which triggers the AI to greet first. I gave it 4 casual variations to prevent it from sounding scripted.

**The duplicate response bug:** After adding the AI-first greeting, a new bug appeared. The caller would say "hey" and the AI would respond with BOTH a greeting AND an answer, giving two responses in a row. I added explicit rules: "If the caller says hey after your greeting, just say 'What would you like to know?' Don't repeat your greeting." and "ONE response per turn. Then STOP and WAIT."

### 3. Silence Detection — Added Then Removed

**The idea:** If there's a long pause after the AI speaks, it should gently check in — "Still there?" or "Anything else you wanna know?"

**Implementation:** I added a `silenceTimerRef` that starts a 15-second countdown after each AI response. If the user doesn't speak within 15 seconds, it injects a hidden `conversation.item.create` message prompting the AI to check in, then triggers a `response.create`.

**The problem:** It kept firing at the wrong time. The caller would be thinking about their answer, and the AI would jump in with "Anything else you wanna know, or?" It felt pushy and awkward. I bumped it to 25 seconds, but it still interrupted natural pauses.

**The decision:** I removed it entirely. The tradeoff is that if someone genuinely walks away, the AI just waits silently. But that's better than interrupting someone who's thinking. Natural conversations have pauses. Filling every silence makes it feel like a sales call. I also added a rule to the system prompt: "When there's a natural pause after answering, just STOP and WAIT. Don't fill silence with filler questions. Let the caller lead."

### 4. Calendly Integration — The Paid API Wall

**Original plan:** Use Calendly's Scheduling API to directly book meetings. The flow would be: check availability → caller picks a time → AI calls `POST /invitees` → meeting is booked automatically.

**The wall:** Calendly's `POST /invitees` endpoint requires a paid plan (Professional or higher). On the free plan, it returns a 403 "Permission Denied." I discovered this after writing the entire integration.

**I had three options:**

1. **Upgrade to Calendly paid** — $12/month. Works, but adds ongoing cost for a portfolio project.
2. **Use a different scheduling tool** — Cal.com has a free API, but I'd need to migrate the entire calendar setup.
3. **Generate a pre-filled Calendly link** — Free plan supports URL parameters for pre-filling name, email, and navigating to a specific date. The caller clicks one link and confirms.

I chose option 3. The tradeoff is that the meeting isn't *automatically* booked — the caller has to click the link and confirm. But the link pre-fills everything (name, email, date), so it's genuinely one click. And it works on the free plan.

**The pre-fill URL format:** Calendly supports `?name=John&email=john@example.com` as query params, and you can navigate to a specific date by appending `/YYYY-MM-DD` to the event type URL. My first attempt used `?month=YYYY-MM` which didn't work — Calendly doesn't support a `month` query param for navigation. I fixed it by putting the date in the URL path:

```
https://calendly.com/annaarivan-a-northeastern/15-min-coffee-chat/2025-02-23?name=John%20Doe&email=john%40example.com
```

**Another issue:** `URLSearchParams` encodes spaces as `+` and `@` as `%40`. Calendly handles `%40` fine but `+` in names was inconsistent. I switched to `encodeURIComponent` which uses `%20` for spaces — more universally compatible.

### 5. Making Links Clickable — The Regex Bug Saga

The AI includes URLs in its text responses (portfolio links, GitHub, booking links). I needed these to render as clickable hyperlinks in the transcript.

**First implementation:** I modified the `cleanText` function to split text by a URL regex and wrap matches in `<a>` tags. Simple enough.

**Bug #1 — Global regex with `.test()`:** I used a global regex (`/g` flag) for both `.split()` and `.test()`. The problem: global regexes maintain a `lastIndex` property. When you call `.test()`, it advances `lastIndex`. On the next call, it starts from where it left off, causing it to alternate between matching and not matching. So every other URL would fail to linkify.

**Fix attempt 1:** I added `urlPattern.lastIndex = 0` after each `.test()` call. This mostly worked but was fragile.

**Fix attempt 2 (final):** I used TWO regexes — a global one for `.split()` and a non-global one (no `/g` flag) for `.test()`. Non-global regexes don't have the `lastIndex` problem. Clean separation of concerns.

**Bug #2 — Bare domains not matching:** The AI would say "check out arivfolio.tech" or "github.com/ArivunidhiA" without the `https://` prefix. My regex only matched `https://...` URLs. I expanded it to also match bare domains:

```regex
/(https?:\/\/[^\s,)]+|(?:[a-zA-Z0-9-]+\.)+(?:com|org|net|io|dev|tech|app|co|me|ai)(?:\/[^\s,)]*)?)/
```

For bare domains, the `href` gets `https://` prepended automatically. The tradeoff is that this could false-positive on things like "I.e." or sentence fragments that look like domains, but in practice it works well for the URLs the AI actually shares.

### 6. Post-Call Recap — The Invisible Summary

**The problem:** When a call ends, the AI calls `generate_summary` to create a recap (Company, Role, Status, Meeting). But the summary was invisible in the transcript. The AI was instructed not to read it out loud (good), but the tool result was only sent back to the AI — it never appeared in the UI.

**The fix:** I used the same pattern as the booking link — directly inject the summary into the `messages` state via `setMessages()`. The summary appears as an assistant message with proper formatting:

```
📋 Recap

Company: Strada
Role: Forward Deployed Engineer
Status: Exploring
Meeting: Scheduled
```

The `cleanText` function handles the newlines by splitting on `\n` and inserting `<br/>` elements. The AI gets a result saying "Summary has been displayed. Do NOT read it out loud." so it just says something brief like "There you go!" and lets the visual summary speak for itself.

### 7. Email Sending — The Domain Verification Wall

**The problem:** Confirmation emails via Resend were failing with a 403 error. The `from` address was `onboarding@resend.dev`, which is Resend's test sender. It only works for sending to the account owner's email. Any other recipient gets blocked.

**The fix:** I needed to verify a custom domain (`arivsai.app`) in Resend. This involved:

1. Adding the domain in Resend's dashboard
2. Adding DNS records (DKIM TXT, SPF MX, SPF TXT, DMARC) in Name.com (the domain registrar)
3. Waiting for DNS propagation
4. Updating the `from` address to `Ariv's AI <ai@arivsai.app>`

The tradeoff is that this requires a verified domain, which means DNS management. But it's a one-time setup, and now emails can be sent to any address.

### 8. The "Anything Else?" Problem

This was one of the most persistent issues. The AI kept asking "Anything else you wanna know?" or "Want me to set up a call with him?" at inappropriate times.

**Root cause 1:** The silence detection timer (see section 3) was injecting check-in prompts during natural pauses. Fixed by removing the timer entirely.

**Root cause 2:** Even without the timer, the AI model itself tends to ask follow-up questions after every response. It's trained to be helpful, and "anything else?" is a natural conversational closer. But in a voice call, it sounds robotic and pushy.

**Root cause 3:** The AI would ask "Want me to set up a call?" even after a meeting was already discussed and a booking link was shared. It wasn't tracking conversation state.

**The fix:** I added multiple explicit rules to the system prompt:
- "NEVER ask 'Anything else you wanna know?' or any variation. It sounds robotic and kills the flow."
- "NEVER proactively offer to set up a call unless the caller brings it up first."
- "If a meeting has already been discussed, NEVER bring up scheduling again."
- "When there's a natural pause, just STOP and WAIT. Let the caller lead."

The key insight: in voice AI, less is more. The AI should respond to what's asked and then shut up. Proactive helpfulness, which works great in chatbots, feels aggressive in voice.

### 9. Link Reading — The Hardest Prompt Engineering Problem

**The problem:** The AI was reading URLs out loud. "Check out his portfolio at arivfolio dot tech." This sounds terrible in a voice call.

**First fix:** I added "NEVER read a URL out loud" to the system prompt. The AI stopped reading full URLs but started reading domain names instead: "check out arivfolio.tech."

**Second fix:** I made the rule more specific: "Don't say arivfolio.tech or github.com out loud." Better, but the AI would sometimes still slip.

**Third fix (and the real insight):** The problem wasn't just about suppressing URLs — it was about what the AI *should* say instead. I added a concrete example:

> If your text says "Here's his portfolio https://arivfolio.tech and his GitHub https://github.com/ArivunidhiA — go ahead and click through" — you should SAY: "Here's his portfolio and his GitHub, I dropped the links in the chat. Go ahead and click through, see what you think."

The key was telling the AI to read the FULL sentence but SKIP the URLs. Without this, it would either read everything (including URLs) or skip the entire sentence (leaving out "go ahead and click through"). The explicit example of what to say vs. what to skip was the breakthrough.

I also had to ensure URLs in the text response always include `https://` so the linkify regex can match them. I added: "Always include the FULL URL with https:// in your text response (e.g. https://arivfolio.tech not just arivfolio.tech)."

### 10. Availability Presentation

**The problem:** The AI was only showing Monday's availability even when Tuesday through Friday also had open slots. A caller asked for Wednesday and was told it wasn't available — but it was.

**Root cause:** The availability API was returning all slots correctly, but the AI was cherry-picking the first day and presenting only those options. The system prompt said "Offer 2-3 times casually" which the AI interpreted as "pick 2-3 slots from the first available day."

**The fix:** I updated both the API response and the system prompt:

- The API `guidance` field now explicitly lists all available days: "Found 10 slots across 5 days (Monday, Tuesday, Wednesday, Thursday, Friday)"
- The system prompt says: "Present ALL available days. If the caller asks for a specific day, check if that day has slots. Don't say a day is unavailable if it has slots."

---

## Deployment

### Vercel + Clerk Production Setup

Deploying to Vercel was mostly smooth, but Clerk caused issues during build. Next.js pre-renders pages at build time, and Clerk's `useUser()` hook throws if it's called outside a Clerk provider (which doesn't exist during static generation).

**The fix:** I created a `useSafeUser()` wrapper that catches the error and returns a null user during build:

```typescript
function useSafeUser() {
  try {
    return useClerkUser();
  } catch {
    return { user: null, isLoaded: true, isSignedIn: false };
  }
}
```

### Environment Variables

The app requires 9 environment variables across 6 services. All need to be set in both `.env` (local) and Vercel's dashboard (production). Missing any one of them causes a specific feature to fail silently, which made debugging tricky early on.

---

## Key Tradeoffs Summary

| Decision | Chose | Over | Why |
|----------|-------|------|-----|
| Voice transport | WebRTC | WebSocket / STT→LLM→TTS | Sub-second latency, direct browser connection |
| Scheduling | Pre-filled Calendly link | Direct API booking | Free plan compatible, one-click UX |
| Vector DB | Supabase pgvector | Pinecone/Weaviate | Already using Supabase, fewer services |
| Silence handling | Remove entirely | 15s/25s timer | Natural pauses > robotic check-ins |
| Link rendering | Dual regex (global split + non-global test) | Single global regex | Avoids lastIndex bug |
| Email sender | Custom domain (ai@arivsai.app) | Resend test sender | Can send to any recipient |
| Auth | Clerk | NextAuth / custom | Drop-in components, caller info for pre-fill |

---

## What I Learned

1. **Voice AI prompt engineering is fundamentally different from chat.** In chat, being thorough is good. In voice, brevity is everything. The most impactful changes were things I told the AI NOT to do.

2. **The `lastIndex` bug on global regexes is a classic JavaScript gotcha.** Using a global regex with `.test()` in a loop will alternate between matching and not matching. Always use a non-global regex for `.test()`.

3. **Silence is not a bug.** My instinct was to fill every pause with something. But in real conversations, pauses are normal. Removing the silence detection made the experience feel more human, not less.

4. **Pre-filled links can replace API integrations.** When the Calendly API required a paid plan, the pre-filled URL approach turned out to be arguably a better UX anyway — the caller sees exactly what they're booking before confirming.

5. **Show, don't tell (in voice).** The post-call recap and booking links work best when they appear visually in the chat without the AI narrating them. The AI says "I dropped it in the chat" and the caller sees it. Clean separation between what's heard and what's seen.
