# Clerk v6 to v7 migration plan (`@clerk/nextjs`)

Status: planned, not migrated. Current: `^6.39.7`. Nothing below was run against v7; confirm each item
against the official v7 upgrade guide before starting.

## Clerk usage in this repo

| File | API |
| --- | --- |
| `web/middleware.ts` | `clerkMiddleware`, `createRouteMatcher`, `auth.protect()` (`@clerk/nextjs/server`) |
| `web/app/layout.tsx` | `ClerkProvider` |
| `web/app/components/AuthHeader.tsx` | `SignedIn`, `SignedOut`, `SignInButton`, `UserButton` |
| `web/app/components/RealtimeVoice.tsx` | `useUser` |
| `web/app/api/analytics/route.ts`, `web/app/api/track/route.ts` | `auth()` |
| `web/app/api/voice/session/route.ts` | `auth()`, `currentUser()` |
| `web/__tests__/{routes,routes-security,analytics}.test.ts` | `vi.mock("@clerk/nextjs/server")` for `auth`, `currentUser` |

Env: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` (`web/.env.example`).

## Breaking-change checklist for this repo

1. List removed/renamed exports in the v7 guide; confirm each import above still exists
   (`clerkMiddleware`, `createRouteMatcher`, `auth`, `currentUser`, `ClerkProvider`, `SignedIn`, `SignedOut`,
   `SignInButton`, `UserButton`, `useUser`). Control components (`SignedIn`/`SignedOut`) are the likeliest to change.
2. `auth()` is awaited in our routes; confirm return shape (`userId`) and `auth.protect()` behavior unchanged.
3. Peer deps: supported `next` (16.4.x), `react`, Node 24 ranges.
4. Env var names and key format unchanged; check any newly required vars.
5. `middleware.ts` vs Next 16 `proxy.ts` convention: decide separately from Clerk.
6. Update test mocks if export names change; rely on typecheck since mocks bypass real types.
7. Verify conditional `ClerkProvider` (only when key set) and the no-key noop middleware.

## Steps

1. Branch; bump `@clerk/nextjs` to v7, run the official codemod if offered (`npx @clerk/upgrade`), review the diff.
2. Fix compile errors in the files above.
3. `cd web && npm run lint && npm run typecheck && npm test && npm run build`.
4. Manual: signed-out `/dashboard` redirects; owner reaches `/dashboard`; `/api/analytics` 401s signed-out;
   voice session route still sees `userId`/email; no-key mode still builds and runs.
5. Vercel preview with test keys before production.
