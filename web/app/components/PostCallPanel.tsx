"use client";

import { useState } from "react";
import { CalendarDays, Check, Copy, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LINKS, tagBookingUrl } from "@/lib/knowledge";
import { trackClick } from "@/lib/track-client";

export type PostState = {
  shareToken?: string;
  shareError?: string;
  summary?: string;
  saving: boolean;
  failed?: boolean;
};

export function PostCallPanel({
  post,
  shareUrl,
  sessionId,
  onRetry,
  onShare,
  onPrint,
}: {
  post: PostState;
  shareUrl: string | null;
  sessionId: string | null;
  onRetry: () => void;
  onShare: () => void;
  onPrint: () => void;
}) {
  const [copied, setCopied] = useState(false);
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
          {!shareUrl && (
            <Button variant="secondary" size="sm" className="gap-2" onClick={onShare}>
              <Copy className="h-4 w-4" aria-hidden />
              Create share link
            </Button>
          )}
          {shareUrl && (
            <Button
              variant="secondary"
              size="sm"
              className="gap-2"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  window.prompt("Copy this link:", shareUrl);
                }
              }}
            >
              {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
              {copied ? "Copied" : "Copy share link"}
            </Button>
          )}
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
      {post.shareError && <p className="mt-2 text-xs text-red-200">{post.shareError}</p>}
    </div>
  );
}
