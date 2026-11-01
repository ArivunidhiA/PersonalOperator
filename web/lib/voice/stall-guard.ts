/**
 * Keeps a caller from being left in silence. Tracks whether the model owes a
 * reply and climbs a ladder when none comes: nudge, firmer nudge, new
 * connection, then a visible line. The ladder pauses while the caller talks, a
 * tool runs or the agent plays. Evidence: docs/qa/evidence/2026-10-31/w1-reliability.
 */
const FILLER = /^(um+|uh+|hm+|mm+|ah+|oh+|er+)$/i;
const CHECK_IN = /(hello|hey|hi|yo|are you (still )?there|you there|can you hear me|anyone there|still there)[\s.,!?]*$/i;

export const STALL_MS = { reply: 3500, checkIn: 2000, emptyTurn: 1500, next: 5000, reconnect: 7000, busy: 500 };

export interface StallDeps {
  playing(): boolean;
  nudge(level: 1 | 2): void;
  /** False when no reconnect is left. */
  reconnect(): boolean;
  giveUp(): void;
}

export function createStallGuard(d: StallDeps) {
  let owed = false;
  let talking = false;
  let tools = 0;
  let attempt = 0;
  let checkIn = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const arm = (ms: number) => {
    clear();
    timer = setTimeout(fire, ms);
  };
  const replyDelay = () => (checkIn ? STALL_MS.checkIn : STALL_MS.reply);
  const fire = () => {
    timer = null;
    if (!owed || talking || tools > 0) return;
    if (d.playing()) return arm(STALL_MS.busy);
    attempt++;
    if (attempt <= 2) {
      d.nudge(attempt as 1 | 2);
      return arm(STALL_MS.next);
    }
    if (attempt === 3 && d.reconnect()) return arm(STALL_MS.reconnect);
    owed = false;
    d.giveUp();
  };

  return {
    /** The model should speak without being asked (greeting, after a tool result). */
    owe(ms: number = STALL_MS.reply) {
      owed = true;
      if (!talking && tools === 0) arm(ms);
    },
    callerStart() {
      talking = true;
      attempt = 0;
      clear();
    },
    callerEnd() {
      talking = false;
      if (owed && tools === 0) arm(replyDelay());
    },
    heard(text: string) {
      const t = text.trim();
      if (!/\p{L}/u.test(t) || FILLER.test(t.replace(/[^\p{L}]/gu, ""))) return;
      owed = true;
      checkIn = CHECK_IN.test(t);
      if (!talking && tools === 0) arm(replyDelay());
    },
    answered() {
      owed = false;
      attempt = 0;
      clear();
    },
    /** The turn ended with no speech: the model chose silence, so don't wait out the full delay. */
    emptyTurn() {
      if (owed && attempt === 0 && !talking && tools === 0) arm(STALL_MS.emptyTurn);
    },
    toolStart() {
      tools++;
      clear();
    },
    toolEnd() {
      tools = Math.max(0, tools - 1);
      if (owed && tools === 0 && !talking) arm(STALL_MS.reply);
    },
    /** New connection: the server's view of who is talking is gone. */
    reset() {
      talking = false;
      tools = 0;
    },
    pending: () => owed,
    stop: clear,
  };
}
