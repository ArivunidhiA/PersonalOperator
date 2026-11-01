"use client";

import { CalendarDays, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LINKS, tagBookingUrl } from "@/lib/knowledge";
import { trackClick } from "@/lib/track-client";

export type PostState = {
  summary?: string;
  saving: boolean;
  failed?: boolean;
};

export function PostCallPanel({
  post,
  sessionId,
  onRetry,
  onPrint,
}: {
  post: PostState;
  sessionId: string | null;
  onRetry: () => void;
  onPrint: () => void;
}) {
  return (
    <div className="mt-4 print:hidden rounded-2xl border border-white/15 bg-white/5 p-5">
      <h2 className="text-base font-semibold">
        {post.saving ? "Saving your transcript…" : post.failed ? "Couldn't save the transcript" : "Your transcript"}
      </h2>
      {post.failed && (
        <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry}>
          Retry
        </Button>
      )}
      {post.summary && <p className="mt-1 text-sm text-white/60">{post.summary}</p>}
      {!post.saving && !post.failed && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" className="gap-2" onClick={onPrint}>
            <Printer className="h-4 w-4" aria-hidden />
            Print or save as PDF
          </Button>
          <a
            href={tagBookingUrl(LINKS.calendly, sessionId)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => trackClick("Book time with Ariv (after call)", e.currentTarget.href, sessionId)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-white/15 px-3 text-sm text-white/85 hover:bg-white/10"
          >
            <CalendarDays className="h-4 w-4" aria-hidden />
            Book time with Ariv
          </a>
        </div>
      )}
    </div>
  );
}
