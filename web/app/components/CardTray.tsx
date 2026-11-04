import { ExternalLink } from "lucide-react";
import { isSafeUrl, type UiCard } from "@/lib/ui-cards";
import type { TranscriptItem } from "@/lib/voice/transcript";

const CHIP = "strip-enter inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ivory";
const QUIET = `${CHIP} border border-white/15 text-white/85 hover:bg-white/10`;

type Booking = Extract<UiCard, { kind: "booking" }>;

/** What the tray shows: bookings first so nothing can push them away, newest first, each link once. */
export function trayEntries(items: TranscriptItem[]) {
  const cards = items.flatMap((it) => (it.role === "card" ? [it.card] : [])).reverse();
  const bookings = cards.filter((c): c is Booking => c.kind === "booking" && isSafeUrl(c.url));
  const seen = new Set<string>();
  const links = cards
    .flatMap((c) => (c.kind === "links" ? c.links : []))
    .filter((l) => (isSafeUrl(l.url) || l.url.startsWith("mailto:")) && !seen.has(l.url) && !!seen.add(l.url));
  return { bookings, links, recap: cards.some((c) => c.kind === "recap") };
}

/**
 * Cards during a call: one row of direct links under the strip, in space the
 * layout always reserves, so a link or booking is one tap away and never
 * scrolls off with the talk. The popup shows the same cards in full, in order.
 */
export function CardTray({ items, onLink, onRecap }: { items: TranscriptItem[]; onLink: (label: string, href: string) => void; onRecap: () => void }) {
  const { bookings, links, recap } = trayEntries(items);
  return (
    <div className="flex h-11 w-full items-center gap-2 overflow-x-auto px-4 [justify-content:safe_center] [scrollbar-width:none]">
      {bookings.map((b) => (
        <a
          key={b.id}
          href={b.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onLink("Confirm on Calendly", b.url)}
          className={`${CHIP} max-w-full bg-garnet font-medium text-white hover:bg-garnet/85`}
        >
          <span className="shrink-0">Confirm on Calendly</span>
          <span className="truncate font-normal text-white/85">{b.when}</span>
          <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
        </a>
      ))}
      {links.map((l) => (
        <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" onClick={() => onLink(l.label, l.url)} className={QUIET}>
          {l.label}
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      ))}
      {recap && (
        <button type="button" onClick={onRecap} className={QUIET}>
          Recap
        </button>
      )}
    </div>
  );
}
