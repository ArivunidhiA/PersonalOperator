"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import type { TextItem, TranscriptItem } from "@/lib/voice/transcript";
import { CardView } from "./CardView";

// The speech transcriber adds em dashes as punctuation; show them as commas.
const displayText = (t: string) => t.replace(/\s*—\s*/g, ", ");

/** W4 live captions: `settled` counts the leading characters that won't change any more. */
type CaptionFields = { caption?: boolean; settled?: number };

/** One line of speech. The unsettled tail of a live caption is dimmer; it changes in place. */
export function LineText({ item, tailClassName = "text-white/60" }: { item: TextItem; tailClassName?: string }) {
  const { caption, settled } = item as TextItem & CaptionFields;
  if (!caption || settled === undefined) return <>{displayText(item.text)}</>;
  return (
    <>
      {displayText(item.text.slice(0, settled))}
      <span className={tailClassName}>{displayText(item.text.slice(settled))}</span>
    </>
  );
}

/** Close enough to the end to count as following the conversation. */
const PIN_SLACK_PX = 40;

/** The whole conversation. Follows the newest line until the reader scrolls up. */
export function TranscriptLog({
  items,
  onLink,
}: {
  items: TranscriptItem[];
  onLink: (label: string, href: string) => void;
}) {
  const logRef = useRef<HTMLDivElement | null>(null);
  const [pinned, setPinned] = useState(true);

  useLayoutEffect(() => {
    const el = logRef.current;
    if (el && pinned) el.scrollTop = el.scrollHeight;
  }, [items, pinned]);

  // The box gets its size only once the dialog opens, and again on rotation.
  useEffect(() => {
    const el = logRef.current;
    if (!el || !pinned || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [pinned]);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < PIN_SLACK_PX);
        }}
        className="h-full space-y-3 overflow-y-auto overscroll-contain px-5 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ivory"
      >
        <TranscriptLines items={items} onLink={onLink} />
      </div>
      {!pinned && (
        <button
          type="button"
          onClick={() => setPinned(true)}
          className="absolute bottom-3 left-1/2 inline-flex h-9 -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ivory focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ArrowDown className="h-4 w-4" aria-hidden />
          Latest
        </button>
      )}
    </div>
  );
}

export function TranscriptLines({ items, onLink }: { items: TranscriptItem[]; onLink: (label: string, href: string) => void }) {
  return items.map((it) =>
    it.role === "card" ? (
      <CardView key={it.id} card={it.card} onLink={onLink} />
    ) : (
      <div key={it.id} className="text-sm leading-6" aria-hidden={!it.final || undefined}>
        <span className="mr-2 text-[11px] font-medium uppercase tracking-wider text-white/60">{it.role === "user" ? "You" : "Ariv's AI"}</span>
        <span className={it.final ? "text-white/85" : "text-white/60"}>
          <LineText item={it} tailClassName="text-white/60" />
        </span>
      </div>
    ),
  );
}
