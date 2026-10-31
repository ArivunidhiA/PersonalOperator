export const dynamic = "force-static";

export const metadata = { title: "Privacy | Ariv's AI" };

const wrap = { maxWidth: 680, margin: "0 auto", padding: "48px 20px", lineHeight: 1.6, fontFamily: "system-ui, sans-serif" } as const;

export default function Privacy() {
  return (
    <main style={wrap}>
      <h1>Privacy</h1>
      <p>This site is a personal project. Here is what happens to your data.</p>

      <h2>Voice calls and Google Gemini</h2>
      <p>
        Calls run on Google&apos;s Gemini Live free tier. Google may use content sent on the free tier, including your
        audio and the transcript, to improve its products. Don&apos;t share anything you wouldn&apos;t want that used for.
      </p>

      <h2>Transcripts</h2>
      <p>
        After a call, the transcript, a short summary, and details you said yourself (such as your name, company, role,
        or email) are stored in Supabase and emailed to Ariv. A transcript is only shared by link if you choose to create
        one; that link expires after 30 days.
      </p>

      <h2>Site analytics</h2>
      <p>First-party only, no cookies and no third-party trackers. For each visit, click, or call start we record:</p>
      <ul>
        <li>page path, referrer (host and path only), UTM tags, language;</li>
        <li>country, region, city, and timezone (from the request headers);</li>
        <li>device, browser, and operating system;</li>
        <li>the owner of your network (for example an ISP or company), looked up from your IP through IPinfo;</li>
        <li>a random visitor id kept in your browser&apos;s local storage;</li>
        <li>which link you clicked, and which call a click belongs to.</li>
      </ul>
      <p>Your IP address itself is never stored; only a salted hash is used as a lookup cache key.</p>

      <h2>EEA, UK and Switzerland</h2>
      <p>
        If you visit from the EEA, UK, or Switzerland, no visitor id is created and visits are not linked to each other.
      </p>

      <h2>Do Not Track and Global Privacy Control</h2>
      <p>If your browser sends Global Privacy Control or Do Not Track, you are not tracked.</p>

      <h2>Retention</h2>
      <p>Calls, caller details, and analytics events are deleted after 90 days.</p>

      <h2>Contact</h2>
      <p>
        Questions or deletion requests: <a href="mailto:annaarivan.a@northeastern.edu">annaarivan.a@northeastern.edu</a>.
      </p>
    </main>
  );
}
