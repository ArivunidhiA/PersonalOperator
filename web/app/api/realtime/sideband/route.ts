import { createLogger } from "@/lib/logger";
import { executeTool } from "@/lib/tool-executor";
import {
  detectAgentTransition,
  buildSessionUpdate,
} from "@/lib/agents";
import WebSocket from "ws";

const log = createLogger({ tool: "sideband" });

export const maxDuration = 300; // Vercel Pro: 5 minutes max

/**
 * Server-Sent Events endpoint for the sideband connection.
 * Establishes a WebSocket to OpenAI's Realtime API using the call_id,
 * handles all tool calls server-side, manages multi-agent transitions,
 * and streams activity updates back to the client.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const callId = url.searchParams.get("call_id");

  if (!callId) {
    return new Response("Missing call_id", { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response("OPENAI_API_KEY not set", { status: 500 });
  }

  const slog = log.child({ sessionId: callId });
  slog.info("Sideband connection requested");

  let currentAgentId = "greeter";
  const callerContext = url.searchParams.get("caller_context") || "";

  const encoder = new TextEncoder();
  let streamController: ReadableStreamDefaultController | null = null;
  let wsInstance: WebSocket | null = null;

  function sendSSE(event: string, data: unknown) {
    if (!streamController) return;
    try {
      const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      streamController.enqueue(encoder.encode(payload));
    } catch {
      // Stream closed
    }
  }

  const stream = new ReadableStream({
    start(controller) {
      streamController = controller;

      const wsUrl = `wss://api.openai.com/v1/realtime?call_id=${callId}`;
      const ws = new WebSocket(wsUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      wsInstance = ws;

      ws.on("open", () => {
        slog.info("Sideband WebSocket connected");
        sendSSE("connected", { agentId: currentAgentId });
      });

      ws.on("message", async (raw) => {
        let evt: Record<string, unknown>;
        try {
          evt = JSON.parse(raw.toString());
        } catch {
          return;
        }

        const type = evt.type as string;
        if (!type) return;

        // Handle tool calls
        if (type === "response.function_call_arguments.done") {
          const callIdStr = evt.call_id as string;
          const name = evt.name as string;
          const argsStr = evt.arguments as string;

          if (!callIdStr || !name) return;

          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(argsStr || "{}");
          } catch {
            args = {};
          }

          slog.info("Tool call received", { tool: name, agent: currentAgentId });
          sendSSE("tool_start", { tool: name, agent: currentAgentId });

          try {
            const { result, uiMessage } = await executeTool(
              name,
              args,
              callId,
            );

            // Send tool result back to OpenAI via WebSocket
            ws.send(
              JSON.stringify({
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id: callIdStr,
                  output: result,
                },
              }),
            );
            ws.send(JSON.stringify({ type: "response.create" }));

            // Stream UI message to client if tool produced one
            if (uiMessage) {
              sendSSE("ui_message", uiMessage);
            }

            sendSSE("tool_done", { tool: name, agent: currentAgentId });

            // Check for agent transitions
            const nextAgent = detectAgentTransition(currentAgentId, name);
            if (nextAgent) {
              slog.info("Agent transition", {
                from: currentAgentId,
                to: nextAgent.id,
                trigger: name,
              });
              currentAgentId = nextAgent.id;

              // Update session instructions and tools
              const update = buildSessionUpdate(nextAgent, callerContext);
              ws.send(JSON.stringify(update));
              sendSSE("agent_switch", {
                agentId: nextAgent.id,
                agentName: nextAgent.name,
              });
            }
          } catch (err) {
            slog.error("Tool execution failed", {
              tool: name,
              error: err instanceof Error ? err.message : String(err),
            });
            sendSSE("tool_error", { tool: name });

            // Send error result so the AI can handle gracefully
            ws.send(
              JSON.stringify({
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id: callIdStr,
                  output: `Error executing ${name}. Offer an alternative naturally.`,
                },
              }),
            );
            ws.send(JSON.stringify({ type: "response.create" }));
          }
        }

        // Forward transcript events so the client can display them
        if (
          type === "conversation.item.input_audio_transcription.delta" ||
          type === "conversation.item.input_audio_transcription.completed" ||
          type === "response.output_audio_transcript.delta" ||
          type === "response.output_audio_transcript.done"
        ) {
          sendSSE("transcript", evt);
        }
      });

      ws.on("error", (err) => {
        slog.error("Sideband WebSocket error", {
          error: err.message,
        });
        sendSSE("error", { message: err.message });
      });

      ws.on("close", (code) => {
        slog.info("Sideband WebSocket closed", { code });
        sendSSE("closed", { code });
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });

      // Keep-alive ping every 30s to prevent timeout
      const keepAlive = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          sendSSE("ping", { ts: Date.now() });
        } else {
          clearInterval(keepAlive);
        }
      }, 30_000);

      // Clean up on abort
      req.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
    cancel() {
      if (wsInstance && wsInstance.readyState === WebSocket.OPEN) {
        wsInstance.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
