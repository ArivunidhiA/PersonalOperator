import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { FaviconAnimator } from "./components/FaviconAnimator";
import { VisitTracker } from "./components/VisitTracker";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ariv's AI",
  description: "Talk to an AI voice agent that knows Ariv's work: what he's building, where he works, and how to book time with him.",
  icons: {
    icon: "/favicon-frame-1.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-black">
      <body className={`${geistSans.variable} antialiased`}>
        <FaviconAnimator />
        <VisitTracker />
        {children}
      </body>
    </html>
  );
}
