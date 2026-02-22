"use client";

import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export function AuthHeader() {
  if (!clerkEnabled) return null;

  return (
    <div className="flex items-center gap-3">
      <SignedOut>
        <SignInButton mode="modal">
          <button className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white hover:bg-white/20 transition-colors">
            Sign in
          </button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <UserButton
          appearance={{
            elements: {
              avatarBox: "h-8 w-8",
            },
          }}
        />
      </SignedIn>
    </div>
  );
}
