const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

export function StatusLine({
  status,
  live,
  modeName,
  secondsLeft,
}: {
  status: string;
  live: boolean;
  modeName?: string;
  secondsLeft: number;
}) {
  return (
    <div className="mt-3 flex h-6 items-center gap-3 text-xs text-white/50">
      <span aria-live="polite">{status}</span>
      {live && modeName && <span className="text-emerald-300/50">{modeName}</span>}
      {live && (
        <span aria-hidden className={secondsLeft <= 60 ? "text-amber-300" : "text-white/30"}>
          {fmt(secondsLeft)} left
        </span>
      )}
      <span className="sr-only" aria-live="polite">
        {live && secondsLeft <= 60 && secondsLeft > 55 ? "One minute left in this call." : ""}
      </span>
    </div>
  );
}
