import { describe, it, expect } from "vitest";

type Role = "user" | "assistant";

type TranscriptMessage = {
  id: string;
  role: Role;
  text: string;
  final: boolean;
};

function upsertDelta(
  prev: TranscriptMessage[],
  id: string,
  role: Role,
  delta: string
): TranscriptMessage[] {
  const index = prev.findIndex((m) => m.id === id);
  if (index === -1) {
    return [...prev, { id, role, text: delta, final: false }];
  }
  const next = [...prev];
  next[index] = { ...next[index], text: next[index].text + delta };
  return next;
}

function finalize(
  prev: TranscriptMessage[],
  id: string,
  role: Role,
  transcript: string
): TranscriptMessage[] {
  const index = prev.findIndex((m) => m.id === id);
  if (index === -1) {
    return [...prev, { id, role, text: transcript, final: true }];
  }
  const next = [...prev];
  next[index] = { ...next[index], text: transcript, final: true };
  return next;
}

describe("upsertDelta", () => {
  it("creates a new message when id is not found", () => {
    const result = upsertDelta([], "msg1", "user", "Hello");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "msg1",
      role: "user",
      text: "Hello",
      final: false,
    });
  });

  it("appends delta to existing message", () => {
    const initial: TranscriptMessage[] = [
      { id: "msg1", role: "user", text: "Hel", final: false },
    ];
    const result = upsertDelta(initial, "msg1", "user", "lo");
    expect(result[0].text).toBe("Hello");
    expect(result[0].final).toBe(false);
  });

  it("does not mutate the original array", () => {
    const initial: TranscriptMessage[] = [
      { id: "msg1", role: "user", text: "Hi", final: false },
    ];
    const result = upsertDelta(initial, "msg1", "user", "!");
    expect(result).not.toBe(initial);
    expect(initial[0].text).toBe("Hi");
  });

  it("handles multiple messages independently", () => {
    let msgs: TranscriptMessage[] = [];
    msgs = upsertDelta(msgs, "u1", "user", "Hey");
    msgs = upsertDelta(msgs, "a1", "assistant", "Hi");
    msgs = upsertDelta(msgs, "u1", "user", " there");
    expect(msgs).toHaveLength(2);
    expect(msgs[0].text).toBe("Hey there");
    expect(msgs[1].text).toBe("Hi");
  });
});

describe("finalize", () => {
  it("creates a finalized message when id is not found", () => {
    const result = finalize([], "msg1", "assistant", "Done");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "msg1",
      role: "assistant",
      text: "Done",
      final: true,
    });
  });

  it("replaces text and marks as final for existing message", () => {
    const initial: TranscriptMessage[] = [
      { id: "msg1", role: "user", text: "partial tex", final: false },
    ];
    const result = finalize(initial, "msg1", "user", "partial text complete");
    expect(result[0].text).toBe("partial text complete");
    expect(result[0].final).toBe(true);
  });

  it("does not affect other messages", () => {
    const initial: TranscriptMessage[] = [
      { id: "u1", role: "user", text: "Hello", final: false },
      { id: "a1", role: "assistant", text: "Hi", final: false },
    ];
    const result = finalize(initial, "u1", "user", "Hello!");
    expect(result[0].text).toBe("Hello!");
    expect(result[0].final).toBe(true);
    expect(result[1].text).toBe("Hi");
    expect(result[1].final).toBe(false);
  });
});

describe("isRecord", () => {
  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  it("returns true for plain objects", () => {
    expect(isRecord({ type: "test" })).toBe(true);
  });

  it("returns false for null", () => {
    expect(isRecord(null)).toBe(false);
  });

  it("returns false for primitives", () => {
    expect(isRecord("string")).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });

  it("returns true for arrays (they are objects)", () => {
    expect(isRecord([])).toBe(true);
  });
});
