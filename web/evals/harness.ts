/**
 * Live-eval harnesses: drive the real voice model with the app's real session
 * config and real tool executor, typing caller turns instead of speaking them.
 * The agent still answers in audio; we read the output transcript (exactly
 * what the caller would hear and see).
 */
import { executeTool } from "@/lib/tool-executor";
import { GREETING_NUDGE, buildOpenAISession } from "@/lib/voice-config";
import { GEMINI_WS_URL, mintGeminiToken } from "@/lib/gemini-token";
import WebSocket from "ws";

export type ToolCall = { name: string; args: Record<string, unknown>; output: string; card?: unknown };
export type TurnResult = {
  user: string | null;
  spoken: string[];
  toolCalls: ToolCall[];
  firstAudioMs: number | null;
  totalMs: number;
  errors: string[];
  rateLimited?: boolean;
};

export interface LiveHarness {
  open(): Promise<void>;
  turn(userText: string | null): Promise<TurnResult>;
  close(): void;
}

const runTool = async (name: string, args: Record<string, unknown>) => {
  const out = await executeTool(name, args, { sessionId: "eval" });
  return out;
};

type Msg = Record<string, unknown>;

/** Gemini Live through the same locked ephemeral token + constrained endpoint as the browser. */
export class GeminiHarness implements LiveHarness {
  private ws!: WebSocket;
  private listeners: ((m: Msg) => void)[] = [];
  private closed: { code: number; reason: string } | null = null;

  async open() {
    const { token, model } = await mintGeminiToken();
    this.ws = new WebSocket(`${GEMINI_WS_URL}?access_token=${encodeURIComponent(token)}`);
    this.ws.on("message", (raw) => {
      let m: Msg;
      try {
        m = JSON.parse(raw.toString());
      } catch {
        return;
      }
      for (const l of [...this.listeners]) l(m);
    });
    this.ws.on("close", (code, reason) => {
      this.closed = { code, reason: reason.toString() };
      for (const l of [...this.listeners]) l({ __closed: true });
    });
    await new Promise<void>((resolve, reject) => {
      this.ws.once("open", () => resolve());
      this.ws.once("error", reject);
    });
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("setup timeout")), 20_000);
      const h = (m: Msg) => {
        if (m.setupComplete) {
          clearTimeout(t);
          this.listeners = this.listeners.filter((x) => x !== h);
          resolve();
        } else if (m.__closed) {
          clearTimeout(t);
          reject(new Error(`closed during setup: ${this.closed?.code} ${this.closed?.reason}`));
        }
      };
      this.listeners.push(h);
      this.ws.send(JSON.stringify({ setup: { model: `models/${model}` } }));
    });
  }

  close() {
    try {
      this.ws.close(1000);
    } catch {
      /* ignore */
    }
  }

  turn(userText: string | null, timeoutMs = 60_000): Promise<TurnResult> {
    const res: TurnResult = { user: userText, spoken: [], toolCalls: [], firstAudioMs: null, totalMs: 0, errors: [] };
    const start = Date.now();
    let current = "";
    let pendingTools = 0;
    let completedWhilePending = false;
    let idle: ReturnType<typeof setTimeout> | null = null;
    return new Promise((resolve) => {
      const done = () => {
        this.listeners = this.listeners.filter((x) => x !== h);
        clearTimeout(hard);
        if (current.trim()) res.spoken.push(current.trim());
        res.totalMs = Date.now() - start;
        resolve(res);
      };
      const hard = setTimeout(() => {
        res.errors.push("turn timeout");
        done();
      }, timeoutMs);
      const h = (m: Msg) => {
        if (m.__closed) {
          const reason = (this.closed?.reason || "").toLowerCase();
          if (/exhaust|quota|rate|resource/.test(reason)) res.rateLimited = true;
          else res.errors.push(`closed ${this.closed?.code} ${this.closed?.reason}`);
          return done();
        }
        const sc = m.serverContent as { outputTranscription?: { text?: string }; modelTurn?: { parts?: unknown[] }; turnComplete?: boolean; interrupted?: boolean } | undefined;
        if (sc) {
          if (sc.modelTurn?.parts?.length || sc.outputTranscription?.text) {
            if (idle) clearTimeout(idle);
            idle = null;
          }
          if (sc.modelTurn?.parts?.length && res.firstAudioMs === null) res.firstAudioMs = Date.now() - start;
          if (sc.outputTranscription?.text) current += sc.outputTranscription.text;
          if (sc.turnComplete) {
            if (pendingTools === 0) done();
            else completedWhilePending = true;
          }
          return;
        }
        const tc = m.toolCall as { functionCalls?: { id: string; name: string; args?: Record<string, unknown> }[] } | undefined;
        if (tc?.functionCalls?.length) {
          if (current.trim()) {
            res.spoken.push(current.trim());
            current = "";
          }
          pendingTools++;
          void Promise.all(
            tc.functionCalls.map(async (fc) => {
              const out = await runTool(fc.name, fc.args ?? {});
              res.toolCalls.push({ name: fc.name, args: fc.args ?? {}, output: out.result, card: out.card });
              return { id: fc.id, name: fc.name, response: { result: out.result }, ...(fc.name === "generate_summary" ? { scheduling: "SILENT" } : {}) };
            }),
          ).then((functionResponses) => {
            pendingTools--;
            this.ws.send(JSON.stringify({ toolResponse: { functionResponses } }));
            // Silent, non-blocking tools (recap) don't trigger another turn.
            if (completedWhilePending && pendingTools === 0 && tc.functionCalls!.every((fc) => fc.name === "generate_summary")) {
              idle = setTimeout(done, 3000);
            }
          });
        }
      };
      this.listeners.push(h);
      const text = userText ?? GREETING_NUDGE;
      this.ws.send(JSON.stringify({ clientContent: { turns: [{ role: "user", parts: [{ text }] }], turnComplete: true } }));
    });
  }
}

/** Optional paid fallback: OpenAI Realtime with the same session builder. */
export class OpenAIHarness implements LiveHarness {
  private ws!: WebSocket;
  private listeners: ((m: Msg) => void)[] = [];

  async open() {
    const session = buildOpenAISession();
    this.ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${session.model}`, {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    });
    this.ws.on("message", (raw) => {
      try {
        const m = JSON.parse(raw.toString());
        for (const l of [...this.listeners]) l(m);
      } catch {
        /* ignore */
      }
    });
    await new Promise<void>((resolve, reject) => {
      this.ws.once("open", () => resolve());
      this.ws.once("error", reject);
    });
    const { audio, ...rest } = session;
    this.ws.send(JSON.stringify({ type: "session.update", session: { ...rest, audio: { output: audio.output, input: { turn_detection: null } } } }));
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }

  turn(userText: string | null, timeoutMs = 60_000): Promise<TurnResult> {
    const res: TurnResult = { user: userText, spoken: [], toolCalls: [], firstAudioMs: null, totalMs: 0, errors: [] };
    const start = Date.now();
    const pending: { call_id: string; name: string; arguments: string }[] = [];
    return new Promise((resolve) => {
      const done = () => {
        this.listeners = this.listeners.filter((x) => x !== h);
        clearTimeout(hard);
        res.totalMs = Date.now() - start;
        resolve(res);
      };
      const hard = setTimeout(() => {
        res.errors.push("turn timeout");
        done();
      }, timeoutMs);
      const h = async (m: Msg) => {
        if (m.type === "response.output_audio_transcript.delta" && res.firstAudioMs === null) res.firstAudioMs = Date.now() - start;
        if (m.type === "response.output_audio_transcript.done") res.spoken.push(String(m.transcript ?? ""));
        if (m.type === "response.function_call_arguments.done") pending.push(m as never);
        if (m.type === "error") {
          const e = m.error as { code?: string; message?: string };
          if (e?.code === "rate_limit_exceeded") res.rateLimited = true;
          else if (e?.code !== "conversation_already_has_active_response") res.errors.push(e?.message ?? "error");
        }
        if (m.type === "response.done") {
          if (!pending.length) return done();
          const calls = pending.splice(0);
          for (const c of calls) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(c.arguments || "{}");
            } catch {
              /* empty */
            }
            const out = await runTool(c.name, args);
            res.toolCalls.push({ name: c.name, args, output: out.result, card: out.card });
            this.ws.send(JSON.stringify({ type: "conversation.item.create", item: { type: "function_call_output", call_id: c.call_id, output: out.result } }));
          }
          this.ws.send(JSON.stringify({ type: "response.create" }));
        }
      };
      this.listeners.push(h);
      if (userText) this.ws.send(JSON.stringify({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: userText }] } }));
      this.ws.send(JSON.stringify({ type: "response.create" }));
    });
  }
}

export function makeHarness(): LiveHarness {
  return process.env.EVAL_PROVIDER === "openai" ? new OpenAIHarness() : new GeminiHarness();
}
