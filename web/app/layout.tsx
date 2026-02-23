import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import { FaviconAnimator } from "./components/FaviconAnimator";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ariv's AI Operator",
  description: "Live voice agent powered by OpenAI Realtime",
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
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <FaviconAnimator />
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
