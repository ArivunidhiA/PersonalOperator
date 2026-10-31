// @vitest-environment node
import { describe, expect, it } from "vitest";

const req = (body: string, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/client-error", { method: "POST", headers: { "content-type": "application/json", ...headers }, body });

describe("/api/client-error", () => {
  it("always 204s for same-origin reports, even bad or oversized ones", async () => {
    const { POST } = await import("@/app/api/client-error/route");
    expect((await POST(req(JSON.stringify({ message: "boom", path: "/" })))).status).toBe(204);
    expect((await POST(req("not json"))).status).toBe(204);
    expect((await POST(req(JSON.stringify({ message: "x".repeat(5000) })))).status).toBe(204);
  });
  it("refuses cross-site posts", async () => {
    const { POST } = await import("@/app/api/client-error/route");
    expect((await POST(req("{}", { "sec-fetch-site": "cross-site" }))).status).toBe(403);
  });
});
