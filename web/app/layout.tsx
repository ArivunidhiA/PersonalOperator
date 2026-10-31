import type { Metadata } from "next";
import { Instrument_Sans, Newsreader } from "next/font/google";
import "./globals.css";
import { VisitTracker } from "./components/VisitTracker";

const sans = Instrument_Sans({ variable: "--font-instrument", subsets: ["latin"] });
const serif = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], style: ["normal", "italic"] });

const description = "Talk to an AI voice agent that knows Ariv's work: what he's building, where he works, and how to book time with him.";

export const metadata: Metadata = {
  metadataBase: new URL("https://arivsai.app"),
  title: "Ariv's AI",
  description,
  icons: {
    icon: "/favicon-frame-1.svg",
  },
  openGraph: { title: "Ariv's AI", description, url: "/", siteName: "Ariv's AI", type: "website" },
  twitter: { card: "summary_large_image", title: "Ariv's AI", description },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-[#0b0a09]">
      <body className={`${sans.variable} ${serif.variable} antialiased`}>
        <VisitTracker />
        {children}
      </body>
    </html>
  );
}
