// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { reportError } = vi.hoisted(() => ({ reportError: vi.fn() }));
vi.mock("@/lib/report-error", () => ({ reportError }));

import { ErrorBoundary } from "@/app/components/ErrorBoundary";
import { finishSchema } from "@/lib/schemas";

afterEach(cleanup);

describe("ErrorBoundary", () => {
  it("reports the caught error", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Boom = () => {
      throw new Error("boom");
    };
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: "boom" }), "ErrorBoundary");
    expect(screen.queryByText("boom")).toBeNull();
  });
});

describe("finishSchema liveAt", () => {
  it("accepts a number and drops junk", () => {
    expect(finishSchema.parse({ ticket: "t", messages: [], liveAt: 1700000000000 }).liveAt).toBe(1700000000000);
    expect(finishSchema.parse({ ticket: "t", messages: [], liveAt: "x" }).liveAt).toBeUndefined();
  });
});
