import type { Metadata } from "next";

// Shared transcripts are caller-submitted and unverified: keep them out of search.
export const metadata: Metadata = {
  title: "Shared conversation · Ariv's AI",
  robots: { index: false, follow: false },
};

export default function SharedCallLayout({ children }: { children: React.ReactNode }) {
  return children;
}
