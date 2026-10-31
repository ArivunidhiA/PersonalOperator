const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

/** Shown only while connecting or live. The countdown appears for the last minute. */
export function StatusLine({ status, secondsLeft, live }: { status: string; secondsLeft: number; live: boolean }) {
  const warn = live && secondsLeft <= 60;
  return (
    <div className="mt-4 flex h-6 items-center gap-3 text-xs text-white/70">
      <span aria-live="polite">{status}</span>
      {warn && (
        <span aria-hidden className="text-amber-300">
          {fmt(secondsLeft)} left
        </span>
      )}
      <span className="sr-only" aria-live="polite">
        {warn && secondsLeft > 55 ? "One minute left in this call." : ""}
      </span>
    </div>
  );
}
