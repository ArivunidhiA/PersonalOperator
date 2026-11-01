export const dynamic = "force-static";

export const metadata = { title: "Privacy | Ariv's AI" };

const wrap = { maxWidth: 640, margin: "0 auto", padding: "56px 20px 80px", lineHeight: 1.65 } as const;
const h2 = { fontSize: 17, fontWeight: 700, margin: "32px 0 8px" } as const;
const ul = { margin: 0, paddingLeft: 20, listStyle: "disc" } as const;

function Topic({ title, items }: { title: string; items: React.ReactNode[] }) {
  return (
    <section>
      <h2 style={h2}>
        <strong>{title}</strong>
      </h2>
      <ul style={ul}>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </section>
  );
}

export default function Privacy() {
  return (
    <main style={wrap}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Privacy</h1>
      <p style={{ opacity: 0.7, marginTop: 0 }}>Personal project. Short version of what happens to your data.</p>

      <Topic
        title="The voice (Google Gemini)"
        items={[
          "Calls run on Google's Gemini API free tier.",
          "In Chrome on a computer, your browser's speech service, run by Google, also turns your voice into live captions while you talk.",
          "Google may use the audio and transcript to improve its models. That's Google's rule, not mine, so please don't say anything sensitive.",
        ]}
      />

      <Topic
        title="Your transcript"
        items={[
          "Saved after the call, with a short summary, and emailed to me.",
          "Only things you said about yourself (name, company, role) are kept. Nothing is looked up about you.",
          "Share links exist only if you make one, and expire after 30 days.",
        ]}
      />

      <Topic
        title="Visits and clicks"
        items={[
          "First-party only. No cookies, no third-party trackers.",
          "Recorded: page, referrer site, device, rough location, the network you're on, and which links you click.",
          "Your IP address is never stored.",
        ]}
      />

      <Topic
        title="Opting out"
        items={[
          "Turn on Do Not Track or Global Privacy Control in your browser and nothing is recorded.",
          "EEA, UK and Switzerland visitors are never linked across visits.",
        ]}
      />

      <Topic title="How long" items={["Everything above is deleted after 90 days."]} />

      <Topic
        title="Questions or deletion"
        items={[
          <a key="m" href="mailto:annaarivan.a@northeastern.edu">
            annaarivan.a@northeastern.edu
          </a>,
        ]}
      />
    </main>
  );
}
