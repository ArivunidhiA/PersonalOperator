import { NextResponse } from "next/server";
import { hybridSearch, rerank } from "@/lib/hybrid-rag";
import { createLogger } from "@/lib/logger";

const log = createLogger({ tool: "rag" });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  const sessionId = body.session_id as string | undefined;
  const slog = log.child({ sessionId });

  try {
    const results = await slog.time("hybrid-search", () =>
      hybridSearch(body.query, 6, sessionId),
    );

    if (results.length === 0) {
      slog.info("No RAG results", { query: body.query });
      return NextResponse.json({ results: [] });
    }

    const reranked = await slog.time("rerank", () =>
      rerank(body.query, results, 3),
    );

    slog.info("RAG complete", {
      query: body.query,
      rawResults: results.length,
      rerankedResults: reranked.length,
    });

    return NextResponse.json({
      results: reranked.map((r) => ({
        content: r.content,
        score: r.score,
        metadata: r.metadata,
      })),
    });
  } catch (err) {
    slog.error("RAG error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
