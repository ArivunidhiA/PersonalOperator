import { Mic, MicOff, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export type Phase = "idle" | "connecting" | "live" | "ending" | "ended";

/** One persistent pill (label/action change) so keyboard focus isn't lost. */
export function CallButton({ phase, onStart, onHangUp }: { phase: Phase; onStart: () => void; onHangUp: () => void }) {
  const live = phase === "live";
  const busy = live || phase === "connecting";
  return (
    <button
      type="button"
      onClick={busy ? onHangUp : onStart}
      disabled={phase === "ending"}
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-[15px] font-medium tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ivory focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 ${
        busy ? "border border-white/30 text-primary hover:bg-white/10" : "bg-primary text-primary-foreground hover:bg-primary/90"
      }`}
    >
      {live ? (
        <>
          <PhoneOff className="h-4 w-4" aria-hidden />
          End
        </>
      ) : phase === "connecting" ? (
        "Cancel"
      ) : phase === "ending" ? (
        "Ending…"
      ) : (
        <>
          <Mic className="h-4 w-4" aria-hidden />
          {phase === "ended" ? "Ask again" : "Ask me"}
        </>
      )}
    </button>
  );
}

export function MuteButton({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <Button
      onClick={onToggle}
      variant="secondary"
      size="sm"
      className="mt-3 rounded-full"
      aria-pressed={muted}
      aria-label={muted ? "Unmute microphone" : "Mute microphone"}
    >
      {muted ? <MicOff className="mr-2 h-4 w-4" aria-hidden /> : <Mic className="mr-2 h-4 w-4" aria-hidden />}
      {muted ? "Unmute" : "Mute"}
    </Button>
  );
}
