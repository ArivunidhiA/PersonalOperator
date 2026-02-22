import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const isProtectedRoute = createRouteMatcher([
  "/",
  "/api/realtime/(.*)",
]);

function noopMiddleware(_req: NextRequest) {
  return NextResponse.next();
}

const handler = clerkKey
  ? clerkMiddleware(async (auth, req) => {
      if (isProtectedRoute(req)) {
        await auth.protect();
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
