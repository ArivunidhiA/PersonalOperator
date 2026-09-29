import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import { FaviconAnimator } from "./components/FaviconAnimator";
import { VisitTracker } from "./components/VisitTracker";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ariv's AI",
  description: "Talk to an AI voice agent that knows Ariv's work: what he's building, where he works, and how to book time with him.",
  icons: {
    icon: "/favicon-frame-1.svg",
  },
};

const clerkPubKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const content = (
    <html lang="en" className="bg-black">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <FaviconAnimator />
        <VisitTracker />
        {children}
        <Analytics />
      </body>
    </html>
  );

  if (clerkPubKey) {
    return <ClerkProvider>{content}</ClerkProvider>;
  }

  return content;
}
