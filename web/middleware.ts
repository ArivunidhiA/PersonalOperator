import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

// Only dashboard and analytics require sign-in; home and voice API allow anonymous
const isProtectedRoute = createRouteMatcher(["/dashboard", "/api/analytics"]);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function noopMiddleware(_req: NextRequest) {
  return NextResponse.next();
}

const handler = clerkKey
  ? clerkMiddleware(async (auth, req) => {
      if (isProtectedRoute(req)) {
        // Anonymous page visits go to sign-in (hosted Clerk page unless NEXT_PUBLIC_CLERK_SIGN_IN_URL says otherwise)
        // instead of a bare 404; the analytics API keeps Clerk's default API behavior.
        const signIn = process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL;
        if (req.nextUrl.pathname.startsWith("/api/") || !signIn) await auth.protect();
        else await auth.protect({ unauthenticatedUrl: new URL(signIn, req.url).toString() });
      }
    })
  : noopMiddleware;

export default handler;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
