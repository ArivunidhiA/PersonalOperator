/**
 * Structured cards a tool can put in the chat. Rendering structured links
 * (instead of regex-linkifying model text) means links always work and the
 * model never has to say a URL.
 */
export type UiCard =
  | { id: string; kind: "links"; title: string; links: { label: string; url: string }[] }
  | { id: string; kind: "booking"; title: string; when: string; url: string }
  | { id: string; kind: "recap"; title: string; lines: string[] };

/** Only http(s) links from our own tool output are ever rendered as anchors. */
export function isSafeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** Plain-text version for transcripts, PDFs and emails. */
export function cardToText(card: UiCard): string {
  switch (card.kind) {
    case "links":
      return `${card.title}\n${card.links.map((l) => `${l.label}: ${l.url}`).join("\n")}`;
    case "booking":
      return `${card.title}\n${card.when}\n${card.url}`;
    case "recap":
      return `${card.title}\n${card.lines.join("\n")}`;
  }
}
