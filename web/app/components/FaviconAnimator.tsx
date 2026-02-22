"use client";

import { useEffect, useRef } from "react";

const DEFAULT_FRAMES = [
  "/favicon-frame-1.svg",
  "/favicon-frame-2.svg",
  "/favicon-frame-3.svg",
];

type FaviconAnimatorProps = {
  frames?: string[];
  intervalMs?: number;
  enabled?: boolean;
};

export function FaviconAnimator({
  frames = DEFAULT_FRAMES,
  intervalMs = 1200,
  enabled = true,
}: FaviconAnimatorProps) {
  const intervalIdRef = useRef<number | null>(null);
  const frameIndexRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    if (typeof document === "undefined") return;

    const mql =
      typeof window !== "undefined" && "matchMedia" in window
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;

    const prefersReducedMotion = mql?.matches ?? false;

    const getOrCreateIconLinks = () => {
      const existing = Array.from(
        document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')
      );

      if (existing.length > 0) return existing;

      const link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
      return [link];
    };

    const links = getOrCreateIconLinks();

    const setFaviconHref = (href: string) => {
      const isSvg = href.includes(".svg");
      for (const link of links) {
        link.href = href;
        if (isSvg) {
          link.type = "image/svg+xml";
          link.sizes = "any";
        }
      }
    };

    const safeFrames = frames.length > 0 ? frames : DEFAULT_FRAMES;

    frameIndexRef.current = 0;
    setFaviconHref(safeFrames[0]);

    const stop = () => {
      if (intervalIdRef.current === null) return;
      window.clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    };

    const tick = () => {
      frameIndexRef.current = (frameIndexRef.current + 1) % safeFrames.length;
      setFaviconHref(safeFrames[frameIndexRef.current]);
    };

    const start = () => {
      if (intervalIdRef.current !== null) return;
      intervalIdRef.current = window.setInterval(() => {
        if (document.hidden) return;
        tick();
      }, intervalMs);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) stop();
      else start();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    const handleMotionPreferenceChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        stop();
        frameIndexRef.current = 0;
        setFaviconHref(safeFrames[0]);
      } else {
        start();
      }
    };

    if (!prefersReducedMotion && safeFrames.length >= 2) {
      start();
    }

    if (mql) {
      if ("addEventListener" in mql) {
        mql.addEventListener("change", handleMotionPreferenceChange);
      } else {
        (
          mql as unknown as {
            addListener: (cb: (e: MediaQueryListEvent) => void) => void;
          }
        ).addListener(handleMotionPreferenceChange);
      }
    }

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      if (mql) {
        if ("removeEventListener" in mql) {
          mql.removeEventListener("change", handleMotionPreferenceChange);
        } else {
          (
            mql as unknown as {
              removeListener: (cb: (e: MediaQueryListEvent) => void) => void;
            }
          ).removeListener(handleMotionPreferenceChange);
        }
      }
    };
  }, [enabled, frames, intervalMs]);

  return null;
}
