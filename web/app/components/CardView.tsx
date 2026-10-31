import { ExternalLink } from "lucide-react";
import { isSafeUrl, type UiCard } from "@/lib/ui-cards";

export function CardView({ card, onLink }: { card: UiCard; onLink: (label: string, href: string) => void }) {
  if (card.kind === "links") {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="text-[11px] font-medium uppercase tracking-wider text-white/40">{card.title}</div>
        <ul className="mt-2 space-y-1">
          {card.links.filter((l) => isSafeUrl(l.url) || l.url.startsWith("mailto:")).map((l) => (
            <li key={l.url}>
              <a href={l.url} target="_blank" rel="noopener noreferrer" onClick={() => onLink(l.label, l.url)} className="inline-flex items-center gap-1.5 text-sm text-sky-300 hover:text-sky-200 hover:underline">
                {l.label}
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (card.kind === "booking") {
    return (
      <div className="rounded-xl border border-sky-400/20 bg-sky-400/5 p-3">
        <div className="text-sm font-medium text-white/90">{card.title}</div>
        <div className="mt-0.5 text-sm text-white/60">{card.when}</div>
        {isSafeUrl(card.url) && (
          <a
            href={card.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onLink("Confirm on Calendly", card.url)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-sky-500/90 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
          >
            Confirm on Calendly
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-white/40">{card.title}</div>
      <ul className="mt-1 space-y-0.5 text-sm text-white/75">
        {card.lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}
