import { ImageResponse } from "next/og";

export const alt = "Ariv's AI: a voice agent that knows his work";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", background: "#0b0a09", padding: "0 96px", gap: 72 }}>
        <div
          style={{
            width: 360,
            height: 360,
            borderRadius: 360,
            display: "flex",
            background: "radial-gradient(circle at 34% 30%, #efe7d8 0%, #b98a7a 32%, #8c2f39 62%, #2a0d12 100%)",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", color: "#efe7d8" }}>
          <div style={{ fontSize: 84, fontWeight: 600, letterSpacing: -2 }}>Ariv&apos;s AI</div>
          <div style={{ marginTop: 20, fontSize: 36, color: "#c9c0b0", maxWidth: 560 }}>Ask me about my work, out loud.</div>
        </div>
      </div>
    ),
    size,
  );
}
