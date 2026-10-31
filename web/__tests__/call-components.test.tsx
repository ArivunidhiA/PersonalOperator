// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CardView } from "@/app/components/CardView";
import { CallButton, MuteButton } from "@/app/components/CallControls";
import { PostCallPanel } from "@/app/components/PostCallPanel";
import { StatusLine } from "@/app/components/StatusLine";
import { TranscriptLog } from "@/app/components/TranscriptLog";

afterEach(cleanup);

describe("CardView", () => {
  it("renders safe links only and reports clicks", () => {
    const onLink = vi.fn();
    render(
      <CardView
        card={{ id: "1", kind: "links", title: "Links", links: [{ label: "GitHub", url: "https://github.com/x" }, { label: "Bad", url: "javascript:alert(1)" }] }}
        onLink={onLink}
      />,
    );
    fireEvent.click(screen.getByRole("link", { name: /github/i }));
    expect(onLink).toHaveBeenCalledWith("GitHub", "https://github.com/x");
    expect(screen.queryByText("Bad")).toBeNull();
  });
  it("renders a booking card with confirm link", () => {
    render(<CardView card={{ id: "2", kind: "booking", title: "Tue", when: "3pm", url: "https://calendly.com/a" }} onLink={() => {}} />);
    expect(screen.getByRole("link", { name: /confirm on calendly/i })).toBeTruthy();
  });
});

describe("CallButton / MuteButton", () => {
  it("starts when idle and hangs up when live or connecting", () => {
    const onStart = vi.fn();
    const onHangUp = vi.fn();
    const { rerender } = render(<CallButton phase="idle" onStart={onStart} onHangUp={onHangUp} />);
    fireEvent.click(screen.getByRole("button", { name: /start talking/i }));
    expect(onStart).toHaveBeenCalled();
    rerender(<CallButton phase="connecting" onStart={onStart} onHangUp={onHangUp} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    rerender(<CallButton phase="live" onStart={onStart} onHangUp={onHangUp} />);
    fireEvent.click(screen.getByRole("button", { name: /end call/i }));
    expect(onHangUp).toHaveBeenCalledTimes(2);
  });
  it("mute button reflects state", () => {
    const onToggle = vi.fn();
    render(<MuteButton muted onToggle={onToggle} />);
    const b = screen.getByRole("button", { name: /unmute microphone/i });
    expect(b.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(b);
    expect(onToggle).toHaveBeenCalled();
  });
});

describe("StatusLine", () => {
  it("shows status, mode and countdown; warns under a minute", () => {
    const { container } = render(<StatusLine status="Listening" live modeName="Closer" secondsLeft={59} />);
    expect(screen.getByText("Listening")).toBeTruthy();
    expect(screen.getByText("Closer")).toBeTruthy();
    expect(container.textContent).toContain("0:59 left");
    expect(container.querySelector(".text-amber-300")).toBeTruthy();
  });
});

describe("TranscriptLog", () => {
  it("shows the empty hint, then lines with em dashes softened", () => {
    const { rerender } = render(<TranscriptLog items={[]} live={false} onLink={() => {}} />);
    expect(screen.getByText(/conversation will show up here/i)).toBeTruthy();
    rerender(<TranscriptLog items={[{ id: "a", role: "assistant", text: "Hi — there", final: true }]} live onLink={() => {}} />);
    expect(screen.getByText("Hi, there")).toBeTruthy();
  });
});

describe("PostCallPanel", () => {
  const base = { sessionId: null, onRetry: vi.fn(), onShare: vi.fn(), onDownload: vi.fn() };
  it("offers retry when saving failed", () => {
    render(<PostCallPanel {...base} post={{ saving: false, failed: true }} shareUrl={null} />);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(base.onRetry).toHaveBeenCalled();
  });
  it("offers share and download once saved", () => {
    render(<PostCallPanel {...base} post={{ saving: false, summary: "Nice." }} shareUrl={null} />);
    fireEvent.click(screen.getByRole("button", { name: /create share link/i }));
    expect(base.onShare).toHaveBeenCalled();
    expect(screen.getByText("Nice.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /book time/i })).toBeTruthy();
  });
});
