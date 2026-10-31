import { ClerkProvider } from "@clerk/nextjs";

const clerkPubKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

// Clerk loads only here: the public pages carry no sign-in code.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return clerkPubKey ? <ClerkProvider>{children}</ClerkProvider> : children;
}
