"use client";

import { useState } from "react";
import { Maximize2 } from "lucide-react";
import type { TextItem, TranscriptItem } from "@/lib/voice/transcript";
import { LineText } from "./TranscriptLog";

/** Lines the screen reader log keeps; older ones have already been announced. */
const ANNOUNCED_LINES = 6;

/** Latest caller line and latest reply. `stale` means the caller has moved on from that reply. */
export function latestLines(items: TranscriptItem[]) {
  let user: TextItem | null = null;
  let agent: TextItem | null = null;
  let stale = false;
  for (let i = items.length - 1; i >= 0 && !(user && agent); i--) {
    const it = items[i];
    if (it.role === "user") user ??= it;
    if (it.role === "assistant" && !agent) {
      agent = it;
      stale = !!user;
    }
  }
  return { user, agent, stale };
}

const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * One fixed-height line of the strip. Text is anchored to its newest words in a
 * clipped box, so long text keeps its end in view and edits can't move anything.
 * The key is the item id: new text in the same line never restarts the animation.
 */
function StripLine({ item, className, textClassName }: { item: TextItem | null; className: string; textClassName: string }) {
  const [shown, setShown] = useState(item);
  const [leaving, setLeaving] = useState<TextItem | null>(null);
  if (item !== shown) {
    setShown(item);
    if (shown && item?.id !== shown.id && !prefersReducedMotion()) setLeaving(shown);
  }
  return (
    <div data-tail className={`relative overflow-hidden ${className}`}>
      {leaving && (
        <p data-leaving className={`strip-leave absolute inset-x-0 bottom-0 ${textClassName}`} onAnimationEnd={() => setLeaving(null)}>
          <LineText item={leaving} />
        </p>
      )}
      {item && (
        <p key={item.id} className={`strip-enter ${textClassName}`}>
          <LineText item={item} tailClassName="text-white/50" />
        </p>
      )}
    </div>
  );
}

/**
 * The running transcript under the orb: no box, one exchange, a constant height.
 * Sighted callers read this; the visually hidden log below speaks settled lines
 * only, so partial captions never reach a screen reader.
 */
export function TranscriptStrip({ items, onExpand }: { items: TranscriptItem[]; onExpand: () => void }) {
  const { user, agent, stale } = latestLines(items);
  const announced = items.filter((it) => it.role === "card" || it.final).slice(-ANNOUNCED_LINES);
  return (
    <>
      <div data-strip className="group relative w-full px-4">
        <div aria-hidden className="space-y-1.5 pr-9">
          {/* One row, reversed: the spacer keeps short text left, long text keeps its end. */}
          <StripLine item={user} className="flex h-5 flex-row-reverse before:flex-1 before:content-['']" textClassName="shrink-0 whitespace-nowrap text-sm leading-5 text-white/60" />
          <StripLine
            item={agent}
            className="strip-tail flex h-[4.5rem] flex-col justify-end"
            textClassName={`text-base leading-6 transition-colors duration-200 motion-reduce:transition-none ${stale ? "text-white/60" : "text-white/90"}`}
          />
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={onExpand}
            aria-label="Open full conversation"
            className="absolute right-2 top-0 flex h-10 w-10 items-center justify-center rounded-md text-white/60 opacity-0 transition-opacity duration-150 hover:text-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ivory group-hover:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100"
          >
            <Maximize2 className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      <div role="log" aria-live="polite" aria-relevant="additions" aria-label="Latest in the conversation" className="sr-only">
        {announced.map((it) => (
          <p key={it.id}>{it.role === "card" ? `Added: ${it.card.title}` : `${it.role === "user" ? "You" : "Ariv's AI"}: ${it.text}`}</p>
        ))}
      </div>
    </>
  );
}
