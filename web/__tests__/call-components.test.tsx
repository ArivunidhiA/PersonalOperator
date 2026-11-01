// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CardView } from "@/app/components/CardView";
import { CallButton, MuteButton } from "@/app/components/CallControls";
import { PostCallPanel } from "@/app/components/PostCallPanel";
import { StatusLine } from "@/app/components/StatusLine";
import { CardTray, trayEntries } from "@/app/components/CardTray";
import { TranscriptLog } from "@/app/components/TranscriptLog";
import { TranscriptStrip, latestLines } from "@/app/components/TranscriptStrip";
import type { TextItem, TranscriptItem } from "@/lib/voice/transcript";

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
    fireEvent.click(screen.getByRole("button", { name: /ask me/i }));
    expect(onStart).toHaveBeenCalled();
    rerender(<CallButton phase="connecting" onStart={onStart} onHangUp={onHangUp} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    rerender(<CallButton phase="live" onStart={onStart} onHangUp={onHangUp} />);
    fireEvent.click(screen.getByRole("button", { name: /^end$/i }));
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
  it("renders nothing without a status", () => {
    const { container } = render(<StatusLine status="" secondsLeft={300} live={false} />);
    expect(container.textContent).toBe("");
  });
  it("hides the countdown until 60 s remain, then warns", () => {
    const { container, rerender } = render(<StatusLine status="Listening" secondsLeft={61} live />);
    expect(screen.getByText("Listening")).toBeTruthy();
    expect(container.textContent).not.toContain("left");
    rerender(<StatusLine status="Listening" secondsLeft={59} live />);
    expect(container.textContent).toContain("0:59 left");
    expect(container.querySelector(".text-amber-300")).toBeTruthy();
  });
});

describe("TranscriptLog", () => {
  it("renders lines with em dashes softened", () => {
    render(<TranscriptLog items={[{ id: "a", role: "assistant", text: "Hi \u2014 there", final: true }]} onLink={() => {}} />);
    expect(screen.getByText("Hi, there")).toBeTruthy();
  });
});

const line = (id: string, role: "user" | "assistant", text: string, final = true): TextItem => ({ id, role, text, final });
const stripOf = (container: HTMLElement) => container.querySelector("[data-strip]") as HTMLElement;

describe("latestLines", () => {
  it("takes only the newest caller line and reply, skipping cards", () => {
    const card: TranscriptItem = { id: "c", role: "card", card: { id: "c", kind: "recap", title: "R", lines: [] } };
    const items = [line("a", "assistant", "old"), line("b", "user", "first"), line("c1", "assistant", "reply"), line("d", "user", "next"), line("e", "assistant", "newest"), card];
    const { user, agent, stale } = latestLines(items);
    expect([user?.text, agent?.text, stale]).toEqual(["next", "newest", false]);
  });
  it("marks a reply stale once the caller has moved on", () => {
    const { user, agent, stale } = latestLines([line("a", "assistant", "reply"), line("b", "user", "new question")]);
    expect([user?.text, agent?.text, stale]).toEqual(["new question", "reply", true]);
  });
  it("copes with an empty transcript", () => {
    expect(latestLines([])).toEqual({ user: null, agent: null, stale: false });
  });
});

describe("TranscriptStrip", () => {
  const captioned = (text: string, settled?: number) => ({ ...line("u", "user", text, false), caption: true, settled }) as TextItem;
  it("has no expand button until there is something to expand", () => {
    const { rerender } = render(<TranscriptStrip items={[]} onExpand={() => {}} />);
    expect(screen.queryByRole("button", { name: /full conversation/i })).toBeNull();
    const onExpand = vi.fn();
    rerender(<TranscriptStrip items={[line("a", "assistant", "Hi")]} onExpand={onExpand} />);
    fireEvent.click(screen.getByRole("button", { name: /full conversation/i }));
    expect(onExpand).toHaveBeenCalled();
  });
  it("dims only the unsettled tail of a live caption", () => {
    const { container } = render(<TranscriptStrip items={[captioned("where does he", 6)]} onExpand={() => {}} />);
    expect(stripOf(container).textContent).toContain("where does he");
    expect(stripOf(container).querySelector("span")?.textContent).toBe("does he");
  });
  it("renders the whole line plainly once settled is gone", () => {
    const { container } = render(<TranscriptStrip items={[captioned("where does he work", undefined)]} onExpand={() => {}} />);
    expect(stripOf(container).querySelector("span")).toBeNull();
  });
  it("edits text in place: same element, no leaving copy", () => {
    const { container, rerender } = render(<TranscriptStrip items={[captioned("where does", 0)]} onExpand={() => {}} />);
    const p = stripOf(container).querySelector("p");
    rerender(<TranscriptStrip items={[captioned("where is he", 5)]} onExpand={() => {}} />);
    expect(stripOf(container).querySelector("p")).toBe(p);
    expect(stripOf(container).querySelector("[data-leaving]")).toBeNull();
    expect(p?.textContent).toBe("where is he");
  });
  it("keeps the old line as a leaving copy when a new turn takes over", () => {
    const { container, rerender } = render(<TranscriptStrip items={[line("a", "assistant", "one")]} onExpand={() => {}} />);
    rerender(<TranscriptStrip items={[line("a", "assistant", "one"), line("b", "assistant", "two")]} onExpand={() => {}} />);
    expect(stripOf(container).querySelector("[data-leaving]")?.textContent).toBe("one");
  });
  it("announces settled lines only, never partial text", () => {
    render(<TranscriptStrip items={[line("a", "assistant", "Settled reply"), captioned("half a thou", 4)]} onExpand={() => {}} />);
    const log = screen.getByRole("log");
    expect(log.textContent).toContain("Settled reply");
    expect(log.textContent).not.toContain("half");
  });
});

describe("CardTray", () => {
  const links = (id: string, ...urls: string[]): TranscriptItem => ({ id, role: "card", card: { id, kind: "links", title: "Links", links: urls.map((url) => ({ label: url, url })) } });
  const booking = (id: string, url = "https://calendly.com/a"): TranscriptItem => ({ id, role: "card", card: { id, kind: "booking", title: "Chat", when: "Tue 3pm", url } });
  it("keeps bookings first, each link once, and drops unsafe urls", () => {
    const { bookings, links: l } = trayEntries([links("1", "https://a.com", "javascript:alert(1)"), booking("2"), booking("3", "javascript:alert(1)"), links("4", "https://a.com", "mailto:x@y.z")]);
    expect(bookings.map((b) => b.id)).toEqual(["2"]);
    expect(l.map((x) => x.url)).toEqual(["https://a.com", "mailto:x@y.z"]);
  });
  it("reports clicks and opens the popup for a recap", () => {
    const onLink = vi.fn();
    const onRecap = vi.fn();
    render(<CardTray items={[booking("2"), { id: "r", role: "card", card: { id: "r", kind: "recap", title: "Recap", lines: ["x"] } }]} onLink={onLink} onRecap={onRecap} />);
    fireEvent.click(screen.getByRole("link", { name: /confirm on calendly/i }));
    expect(onLink).toHaveBeenCalledWith("Confirm on Calendly", "https://calendly.com/a");
    fireEvent.click(screen.getByRole("button", { name: /recap/i }));
    expect(onRecap).toHaveBeenCalled();
  });
});

describe("PostCallPanel", () => {
  const base = { sessionId: null, onRetry: vi.fn(), onShare: vi.fn(), onPrint: vi.fn() };
  it("offers retry when saving failed", () => {
    render(<PostCallPanel {...base} post={{ saving: false, failed: true }} shareUrl={null} />);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(base.onRetry).toHaveBeenCalled();
  });
  it("offers share and download once saved", () => {
    render(<PostCallPanel {...base} post={{ saving: false, summary: "Nice." }} shareUrl={null} />);
    fireEvent.click(screen.getByRole("button", { name: /create share link/i }));
    expect(base.onShare).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /print or save as pdf/i }));
    expect(base.onPrint).toHaveBeenCalled();
    expect(screen.getByText("Nice.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /book time/i })).toBeTruthy();
  });
});
