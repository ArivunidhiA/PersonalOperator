"use client";

import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import type { TranscriptItem } from "@/lib/voice/transcript";
import { TranscriptLog } from "./TranscriptLog";

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex="0"]';

/**
 * The full conversation, live. Mount it to open it: showModal gives Esc, the
 * inert page behind and focus back to the opener on close. Tab is also wrapped
 * here, because the browser would otherwise let it leave for its own toolbar.
 */
export function TranscriptDialog({ items, onLink, onClose }: { items: TranscriptItem[]; onLink: (label: string, href: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useLayoutEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  const wrapTab = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key !== "Tab") return;
    const all = [...e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!all.length) return;
    const first = all[0];
    const last = all[all.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby="transcript-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={onClose}
      onKeyDown={wrapTab}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="strip-enter m-0 h-dvh max-h-none w-full max-w-none flex-col bg-background text-foreground open:flex backdrop:bg-black/70 sm:m-auto sm:h-[min(44rem,85dvh)] sm:w-[min(44rem,calc(100vw-4rem))] sm:rounded-2xl sm:border sm:border-white/10"
    >
      <div className="flex shrink-0 items-center justify-between py-2 pl-5 pr-2">
        <h2 id="transcript-title" className="text-sm font-medium text-white/85">
          Conversation
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close conversation"
          className="flex h-10 w-10 items-center justify-center rounded-md text-white/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ivory"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <TranscriptLog items={items} onLink={onLink} />
    </dialog>
  );
}
