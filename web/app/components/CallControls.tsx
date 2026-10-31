import { Mic, MicOff, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export type Phase = "idle" | "connecting" | "live" | "ending" | "ended";

/** One persistent button (label/action change) so keyboard focus isn't lost. */
export function CallButton({ phase, onStart, onHangUp }: { phase: Phase; onStart: () => void; onHangUp: () => void }) {
  const live = phase === "live";
  const busy = live || phase === "connecting";
  return (
    <Button
      onClick={busy ? onHangUp : onStart}
      disabled={phase === "ending"}
      variant={busy ? "destructive" : "default"}
      className="rounded-full px-5 text-sm"
    >
      {live ? (
        <>
          <PhoneOff className="mr-2 h-4 w-4" aria-hidden />
          End call
        </>
      ) : phase === "connecting" ? (
        "Cancel"
      ) : phase === "ending" ? (
        "Ending…"
      ) : (
        <>
          <Mic className="mr-2 h-4 w-4" aria-hidden />
          {phase === "ended" ? "Talk again" : "Start talking"}
        </>
      )}
    </Button>
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
