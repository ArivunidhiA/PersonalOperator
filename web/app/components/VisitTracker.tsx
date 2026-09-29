"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackVisit } from "@/lib/track-client";

/** Records one visit per page view (skips Ariv's own dashboard). */
export function VisitTracker() {
  const path = usePathname();
  useEffect(() => {
    if (!path || path.startsWith("/dashboard")) return;
    void trackVisit(path);
  }, [path]);
  return null;
}
