"use client";

import { useEffect, useRef } from "react";
import type { TranscriptItem } from "@/lib/voice/transcript";
import { CardView } from "./CardView";

// The speech transcriber adds em dashes as punctuation; show them as commas.
const displayText = (t: string) => t.replace(/\s*—\s*/g, ", ");

export function TranscriptLog({
  items,
  onLink,
}: {
  items: TranscriptItem[];
  onLink: (label: string, href: string) => void;
}) {
  const logRef = useRef<HTMLDivElement | null>(null);

  // Keep the newest line in view.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items]);

  return (
    <div
      ref={logRef}
      data-print="transcript"
      role="log"
      aria-live="polite"
      className="max-h-[45vh] min-h-[6rem] space-y-3 overflow-y-auto overscroll-contain rounded-2xl border border-white/10 bg-white/[0.03] p-4 lg:max-h-[60vh]"
    >
      {
        items.map((it) =>
          it.role === "card" ? (
            <CardView key={it.id} card={it.card} onLink={onLink} />
          ) : (
            <div key={it.id} className="text-sm leading-6" aria-hidden={!it.final || undefined}>
              <span className="mr-2 text-[11px] font-medium uppercase tracking-wider text-white/60">{it.role === "user" ? "You" : "Ariv's AI"}</span>
              <span className={it.final ? "text-white/85" : "text-white/60"}>{displayText(it.text)}</span>
            </div>
          ),
        )
      }
    </div>
  );
}
