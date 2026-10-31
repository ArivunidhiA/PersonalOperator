/**
 * Single source of truth for everything the agent may say about Ariv.
 *
 * Two levels: `card` is the short version inlined in the voice prompt, so most
 * questions need no tool call. `text` is the full dossier, searched in memory by
 * retrieve_knowledge. A fact with no card is reachable only through that tool:
 * what the agent must not volunteer lives there, and so does technical depth.
 *
 * - scripts/seed-knowledge.mjs mirrors FACTS into Supabase knowledge_base (not read at runtime).
 * - scripts/seed-knowledge.mjs seeds Supabase knowledge_base from FACTS.
 * - __tests__/knowledge.test.ts keeps prompts, seed and facts from drifting.
 *
 * Keep this file dependency-free: the seed script imports it with plain Node.
 * Rules for editing: only true, verifiable things; no metrics we can't back up;
 * never name INZI's customers, programs or parts. Facts hold no instructions:
 * how to use them belongs in lib/system-prompt.ts.
 */

export type Fact = {
  id: string;
  topic: string;
  /** One line for the prompt. Omit to keep the fact in the dossier only. */
  card?: string;
  text: string;
  keywords: string[];
};

export const LINKS = {
  linkedin: "https://www.linkedin.com/in/arivunidhi-anna-arivan/",
  github: "https://github.com/ArivunidhiA",
  x: "https://x.com/Ariv_2012",
  email: "annaarivan.a@northeastern.edu",
  calendly: "https://calendly.com/annaarivan-a-northeastern/15-min-coffee-chat",
  forecost: "https://github.com/ArivunidhiA/forecost",
  forecostPypi: "https://pypi.org/project/forecost/",
  voiceAgentRepo: "https://github.com/ArivunidhiA/PersonalOperator",
  ralphLoopArena: "https://github.com/ArivunidhiA/Ralph-vs-traditional-agent",
} as const;

export type LinkKey = keyof typeof LINKS;

export const LINK_LABELS: Record<LinkKey, string> = {
  linkedin: "LinkedIn",
  github: "GitHub",
  x: "X (Twitter)",
  email: "Email",
  calendly: "Book a 15-min chat",
  forecost: "forecost on GitHub",
  forecostPypi: "forecost on PyPI",
  voiceAgentRepo: "This voice agent's code",
  ralphLoopArena: "Ralph Loop Arena",
};

/**
 * Booking links carry UTM tags. Calendly saves them on the booking
 * (invitee.tracking), so the dashboard can tie a booking back to the call or
 * visit it came from. `ref` is a session id (s_...) or visitor id (v_...).
 */
export function tagBookingUrl(url: string, ref?: string | null): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", "arivsai");
  u.searchParams.set("utm_medium", "voice_agent");
  if (ref) u.searchParams.set("utm_content", ref.slice(0, 64));
  return u.toString();
}

/** What this agent runs on. Keep in sync with lib/voice-config.ts. */
export const AGENT_STACK =
  "Gemini Live, Google's realtime speech-to-speech model (gemini-3.8-live on the free tier), a small knowledge base about Ariv, and a few tools for his calendar and links. The site is Next.js and TypeScript on Vercel, with Supabase for storage";

export const FACTS: Fact[] = [
  {
    id: "bio",
    topic: "Who Ariv is",
    card: "Ariv (Arivunidhi Anna Arivan) is 25 and lives in Alabama. Came to the US in 2023, to Boston, for Northeastern. Master's in Business Analytics from Northeastern, B.Tech in Computer Science from SRM in India.",
    text: "Ariv (full name Arivunidhi Anna Arivan) is 25 and lives in Alabama. He came to the US in 2023, to Boston, for Northeastern. He has a master's in Business Analytics from Northeastern University in Boston and a B.Tech in Computer Science from SRM Institute of Science and Technology in India. He's most drawn to AI engineering, product management and software engineering, including applied AI and forward-deployed roles.",
    keywords: ["who", "about", "background", "education", "degree", "school", "university", "northeastern", "srm", "master", "masters", "live", "location", "where", "alabama", "looking", "roles", "age", "old", "came", "move", "moved", "us"],
  },
  {
    id: "languages",
    topic: "Languages",
    card: "Speaks Tamil and English, plus a little Korean, French and Spanish, enough to survive. You yourself only speak English.",
    text: "Ariv speaks Tamil and English. He also has a little Korean, French and Spanish, very little but enough to survive.",
    keywords: ["language", "languages", "speak", "speaks", "tamil", "english", "korean", "french", "spanish", "fluent"],
  },
  {
    id: "the-move",
    topic: "Moving to the US",
    text: "Ariv came to the US in 2023, to Boston, for his master's at Northeastern. Moving countries for grad school means juggling a lot at once, and he fought through all of it. That's who he is.",
    keywords: ["move", "moved", "moving", "immigrant", "grad", "story", "journey", "tough", "hard", "hardest", "challenge", "struggle", "came", "boston"],
  },
  {
    id: "team",
    topic: "The team he wants",
    card: "A team that works fast and expects the same from him, that would rather see lots on his plate than nothing, with a good direction and moving forward.",
    text: "The team Ariv wants works fast and expects the same from him, would be happier with lots on his plate than nothing, and has a good direction and keeps moving forward.",
    keywords: ["team", "culture", "environment", "manager", "kind", "ideal", "fast", "plate", "looking"],
  },
  {
    id: "direction",
    topic: "Direction",
    card: "Inclined toward AI engineering, product management and software engineering. Builds AI agents, voice agents and developer tools on his own every day, and ships them. Lead with this, then his job.",
    text: "Ariv is inclined toward AI engineering, product management and software engineering. He works on AI engineering every day on his own, building agents, voice agents and developer tools and shipping them, so that's the lens to see him through, whatever his current title says.",
    keywords: ["direction", "goal", "goals", "interested", "interests", "passion", "want", "wants", "looking", "headed", "future", "career", "inclined", "focus", "ai", "engineering", "product", "management", "pm", "software", "every", "daily", "day"],
  },
  {
    id: "current-job",
    topic: "Current job",
    card: "Full-time at INZI Controls, an automotive parts supplier, since June 2026. Title: Client Project Coordinator. The work is basically forward-deployed: the bridge between INZI and the other companies on a project, keeping engineering, quality, production and sales aligned and driving issues to closed. He doesn't go in to build their software.",
    text: "Right now Ariv works full-time at INZI Controls, an automotive parts supplier, as a Client Project Coordinator. He started in June 2026. The title says coordinator, but the work is basically forward-deployed: he's the bridge between INZI and the other companies on a project, translating what each side needs, keeping engineering, quality, production and sales aligned across companies, and driving open issues until they close. The one difference from a forward-deployed engineer is that he doesn't go into the other company to build or fix their software.",
    keywords: ["job", "work", "current", "currently", "now", "today", "inzi", "controls", "coordinator", "client", "project", "day", "role", "employer", "company", "automotive", "forward", "deployed", "bridge"],
  },
  {
    id: "current-projects",
    topic: "Building right now",
    card: "Registrum: tells you when what shipped stopped matching what the designer signed off in Figma; pre-release, mid-rewrite. Malbit: real-time Korean and English voice translation for work meetings, running entirely on the laptop.",
    text: "Right now Ariv is building two things on his own. Registrum tells you when what shipped stopped matching what the designer signed off in Figma: a permission dialog that shipped before its explanation, a skip option that quietly disappeared, copy that flipped meaning. It's pre-release, mid-rewrite. Malbit is a real-time Korean and English voice translation overlay for work meetings that runs entirely on the laptop, so audio and transcripts never leave the machine.",
    keywords: ["registrum", "malbit", "design", "translation", "translate", "current", "currently", "now", "working", "building", "projects", "side", "new"],
  },
  {
    id: "free-time",
    topic: "Outside work",
    card: "Basically trying to become a polymath: software, AI, woodworking, art, the gym, and guitar (plays might be generous; he's learning).",
    text: "Ariv's day job takes most of his day, so whatever time survives goes to his own engineering projects and his health. Outside work he's basically trying to become a polymath: software, AI, woodworking, art, the gym, and he plays guitar (plays might be generous; he's learning).",
    keywords: ["free", "time", "hobby", "hobbies", "fun", "weekend", "outside", "personal", "gym", "woodworking", "art", "guitar", "music", "health", "schedule", "busy"],
  },
  {
    id: "engineer-or-coordinator",
    topic: "Engineer or coordinator",
    card: "An engineer at heart with project management on top. Joined INZI to fill a gap between customers, engineering, production and timelines, then picked up engineering problems too, so he does a bit of both.",
    text: "Ariv is an engineer at heart, with project management skills on top. He joined INZI because the company needed someone to bridge customers, engineering, production and timelines, a gap he could fill from day one. Then he started noticing engineering problems there too and picked those up, so now he does a bit of both. He likes finding a problem, digging into why it happens and fixing it.",
    keywords: ["engineer", "coordinator", "technical", "both", "which", "really", "heart", "gap", "gaps", "problem", "problems", "solve"],
  },
  {
    id: "how-he-works",
    topic: "How he works",
    card: "Notices something that sucks, asks why, starts building. At his best when a problem isn't perfectly defined yet.",
    text: "Ariv's creativity is practical: he notices something that sucks, asks why, and starts building. His path is a mix of software, data, AI, automotive manufacturing, project coordination, open source and his own products, so don't judge him only by his job title. He does best when a problem isn't perfectly defined yet. Does he ship fast? This voice agent is one of the things he shipped.",
    keywords: ["creative", "creativity", "ship", "ships", "fast", "speed", "quick", "how", "works", "think", "thinks", "approach", "style", "messy", "ambiguous", "ambiguity", "else", "know"],
  },
  {
    id: "weakness",
    topic: "His one weakness",
    card: "He takes on too much. Sees five interesting problems, wants to solve six. Better at prioritizing than he was.",
    text: "Ariv's real weakness: he takes on too much. If he sees five interesting problems, he wants to solve six. He's gotten better at prioritizing, but saying not now is still a work in progress.",
    keywords: ["weakness", "weaknesses", "weak", "flaw", "flaws", "bad", "downside", "reason", "not", "hire", "improve", "prioritize", "prioritizing"],
  },
  {
    id: "where-he-wants-to-work",
    topic: "Where he wants to work",
    card: "He keeps the list to himself, but it has big names you'd know.",
    text: "Where Ariv wants to work: he keeps the list to himself, but it has some big names you'd know. He's aiming for AI engineering, product and software roles, including applied AI and forward-deployed work.",
    keywords: ["where", "want", "wants", "companies", "company", "dream", "target", "list", "looking", "relocate", "relocating", "move", "next"],
  },
  {
    id: "forecost",
    topic: "forecost",
    card: "His open source flight recorder for AI agent work (Python, on PyPI): logs what coding agents actually spend to a local ledger without storing prompts, enforces budgets so an agent can't run away overnight. A fuel gauge for your AI bill instead of a receipt.",
    text: "forecost is Ariv's open source project (MIT license, Python, on PyPI), a flight recorder for AI agent work. It logs what coding agents like Claude Code, and apps using LiteLLM, actually spend into a local SQLite ledger without storing your prompts, reconciles meters that disagree, and enforces budgets so an agent can't run away overnight. Its burn command projects your spending against your budget: a fuel gauge for your AI bill instead of a receipt at the end. CI runs on 3 operating systems and 4 Python versions, with a privacy test that checks no prompt content leaks. It's alpha, and Ariv is the main user so far.",
    keywords: ["forecost", "for cost", "cost", "costs", "budget", "ledger", "spend", "open", "source", "pypi", "python", "package", "claude", "litellm", "burn", "bill"],
  },
  {
    id: "forecost-honest",
    topic: "forecost: the part he left out",
    text: "Ariv first tried to make forecost predict what agent runs would cost. He tested the prediction on 601 of his own agent turns and the range was too wide to be useful, so he shipped the logging and budget parts and left prediction switched off. He'd rather show a trustworthy log than a pretty wrong number.",
    keywords: ["forecost", "predict", "prediction", "forecast", "forecasting", "estimate", "honest", "failure", "lesson", "turns", "tested", "off"],
  },
  {
    id: "voice-agent",
    topic: "This voice agent",
    card: "Ariv built you with AI coding tools: Gemini Live (gemini-3.8-live) speech to speech over a browser WebSocket, Next.js and TypeScript on Vercel, Supabase for storage. First audio comes back in about a second in his tests. The code's public on his GitHub.",
    text: `This voice agent is one of Ariv's projects. It runs on ${AGENT_STACK}. He built it with AI coding tools along the way: the voice pipeline, the tools, rate limiting, tests and CI. The code is on his GitHub.`,
    keywords: ["you", "this", "agent", "voice", "built", "build", "made", "how", "llm", "model", "platform", "stack", "architecture", "operator", "arivsai", "openai", "gemini", "ai", "which"],
  },
  {
    id: "voice-audio",
    topic: "How this agent handles audio",
    text: "The browser talks straight to Gemini Live over a WebSocket, with a short-lived token that locks the prompt and tools on the server side. Mic audio goes through an AudioWorklet as 16 kHz PCM. Barge-in: Gemini's voice activity detection flags the interruption and the browser flushes its playback buffer at once. Echo: browser echo cancellation is on, and on Chromium playback runs through a local WebRTC loopback, because Chromium's canceller only hears audio played through WebRTC.",
    keywords: ["barge", "barge-in", "interrupt", "interruption", "echo", "audio", "vad", "websocket", "webrtc", "pcm", "worklet", "mic", "microphone", "pipeline", "streaming"],
  },
  {
    id: "voice-retrieval",
    topic: "How this agent knows things",
    card: "No vector search at call time: a short fact card sits in your prompt, and deeper details come from a keyword search with synonyms over an in-memory dossier. Supabase keeps a mirror with embeddings that calls don't read.",
    text: "There's no vector search at call time. A short fact card sits in the prompt, and anything deeper comes from a keyword search with synonyms and spoken variants over an in-memory dossier, so a lookup is instant. Questions that find nothing are logged so Ariv can fill the gap. Supabase keeps a mirror of the facts with embeddings, but calls don't read it.",
    keywords: ["rag", "retrieval", "retrieve", "vector", "embedding", "embeddings", "knowledge", "pgvector", "search", "database", "lookup"],
  },
  {
    id: "voice-checks",
    topic: "How this agent is checked",
    text: "Every call's transcript goes through a deterministic fact checker afterwards: plain code, no model grading itself. It flags invented numbers, claimed titles, human claims, spoken URLs and confidential terms, the flags go to Ariv, and they block a share link. Before a release, scripted red-team conversations run against the real model several times each.",
    keywords: ["checker", "verify", "verifier", "guardrail", "guardrails", "hallucination", "hallucinate", "eval", "evals", "tests", "testing", "safety", "accurate", "accuracy", "lie"],
  },
  {
    id: "voice-latency",
    topic: "How fast this agent is",
    text: "In Ariv's live test runs the first audio comes back in about a second after a test turn, and the target is under 2 seconds for a factual question. Those runs send typed turns, so they don't include speech detection on a real mic.",
    keywords: ["latency", "lag", "delay", "fast", "slow", "speed", "ms", "millisecond", "milliseconds", "response", "time"],
  },
  {
    id: "open-source",
    topic: "Open source",
    card: "All merged in early 2026: two bug fixes in Agno, an agent framework (streaming token usage counted twice for Anthropic models; shared state in tool-call parsing), two changes in NVIDIA NeMo Curator, three docs fixes in PyTorch AO, two small features in PaperBanana.",
    text: "Ariv's open source contributions, all merged in early 2026: two bug fixes in Agno, an agent framework (one stopped streaming token usage from being counted twice for Anthropic models, the other fixed shared state in tool-call parsing), both with regression tests. Two merged changes in NVIDIA NeMo Curator. Three documentation fixes in PyTorch AO. Two small features in PaperBanana.",
    keywords: ["open", "source", "contributions", "oss", "agno", "nemo", "curator", "nvidia", "pytorch", "ao", "paperbanana", "merged", "pr", "prs", "pull", "github"],
  },
  {
    id: "forecost-depth",
    topic: "forecost: how it's built and the hardest bug",
    text: "forecost is a Python CLI on Click, Rich and SQLite. Its hardest bug was double counting: Claude Code writes one log record per content block, so keying on the record ID inflated totals to more than double. Keying on the request ID fixed it. Design choices: meter readings and charges are separate immutable records, so a pricing fix never rewrites history. Every valuation names its authority, so imported files can never count as billed. The SQLite ledger runs in WAL mode with synchronous FULL, because NORMAL could lose a commit on power failure.",
    keywords: ["forecost", "bug", "hardest", "double", "counting", "design", "decision", "decisions", "architecture", "sqlite", "wal", "durability", "immutable", "request", "click", "built", "how"],
  },
  {
    id: "agno-depth",
    topic: "The Agno bugs in detail",
    text: "Two merged Agno fixes. First: Anthropic streaming counted input tokens twice, so usage is now read only from the stop event. Second: a Python list built by multiplying one empty dict made every tool call share the same dict, which caused duplicate execution and provider errors. He fixed that one across four providers. Both have regression tests.",
    keywords: ["agno", "bug", "bugs", "fix", "fixes", "hardest", "token", "tokens", "streaming", "tool-call", "tool", "dict", "shared", "anthropic", "providers", "walk"],
  },
  {
    id: "nemo-depth",
    topic: "NeMo Curator and PaperBanana in detail",
    text: "NeMo Curator: setting both blocksize and files_per_partition used to crash cryptically, so it now warns and picks one, and removing one re-export stopped the package importing transformers for nothing. PaperBanana: he added a verbose flag with per-agent timing, clear errors for missing keys, and fixed Settings silently ignoring a key passed to it. PyTorch AO: three docs fixes.",
    keywords: ["nemo", "curator", "nvidia", "paperbanana", "pytorch", "ao", "blocksize", "transformers", "verbose", "contributions", "detail"],
  },
  {
    id: "voice-agent-security",
    topic: "How this agent is locked down",
    text: "The server mints a single-use Gemini token with the prompt and tools locked in, so the browser can't change them. Call endpoints need a signed HMAC ticket. No tool can email anyone or read another caller's data. A real bug from building it: a false stall nudge made the agent repeat itself after late transcripts, so the nudge now arms only if the mic actually carried voice.",
    keywords: ["security", "secure", "token", "ephemeral", "hmac", "ticket", "abuse", "locked", "bug", "hardest", "nudge", "stall", "stack", "clerk", "resend"],
  },
  {
    id: "ralph",
    topic: "Ralph Loop Arena",
    text: "Ralph Loop Arena is a small experiment Ariv built. It runs a fresh-context coding agent (the Ralph loop pattern, credit to Geoffrey Huntley) against a standard long-context agent on the same task, so you can watch context rot happen. FastAPI backend with asyncpg that calls real LLMs, React front end, with results streamed over server-sent events. The standard agent resends every prior attempt, while the Ralph agent gets only the task plus a state file.",
    keywords: ["ralph", "loop", "arena", "context", "rot", "experiment", "coding", "agent", "fastapi", "react", "sse", "streaming"],
  },
  {
    id: "serotonin",
    topic: "Serotonin",
    card: "Product intern at Serotonin, a Web3 startup, summer 2024, remote. Owned the data layer behind the events calendar and built internal tools in Python and FastAPI.",
    text: "Ariv was a product intern at Serotonin, a Web3 startup, in summer 2024 (June to September), remote. He owned the data layer behind the company's events calendar and kept adding new data sources to it, and he built small internal tools in Python and FastAPI to replace manual updates. He worked with LangChain, Pinecone, PostHog and Datadog.",
    keywords: ["serotonin", "web3", "intern", "internship", "product", "2024", "summer", "events", "calendar", "fastapi", "langchain", "pinecone"],
  },
  {
    id: "hyundai",
    topic: "Hyundai",
    card: "Intern at Hyundai Motor India in Chennai, 2023, doing real software engineering work: Python and TensorFlow for a vehicle-data team, packaged in Docker, shipped through Jenkins CI/CD to AWS.",
    text: "Ariv interned at Hyundai Motor India in Chennai in 2023, and he did real software engineering work there: he wrote Python and TensorFlow code for a vehicle-data team, packaged it in Docker, and shipped it through Jenkins CI/CD to AWS. The work was software engineering; only the title was different.",
    keywords: ["hyundai", "intern", "internship", "2023", "chennai", "india", "tensorflow", "vehicle", "docker", "jenkins", "aws"],
  },
  {
    id: "volunteer",
    topic: "Volunteer work",
    card: "Volunteer developer for two nonprofits, never jobs. Crossroads of Michigan: Stripe donations into Salesforce with webhook retries. Bright Mind Enrichment: a volunteer coordination app in React, Node.js and Firebase.",
    text: "Ariv did volunteer developer work for two nonprofits. These were volunteer roles, not jobs. At Crossroads of Michigan (summer 2024, alongside his Serotonin internship) he connected Stripe donations to Salesforce, with webhook retries so a failed event didn't create a duplicate donor record. His takeaway: the hardest bugs live in the spaces between systems. At Bright Mind Enrichment, a community wellness nonprofit, he built a volunteer coordination app (React, Node.js, Firebase notifications) after finishing his master's. That volunteer role ended in 2026, before he joined INZI.",
    keywords: ["volunteer", "volunteering", "nonprofit", "crossroads", "michigan", "bright", "mind", "enrichment", "stripe", "salesforce", "firebase", "react"],
  },
  {
    id: "skills",
    topic: "Skills",
    card: "Strongest: Python, TypeScript, FastAPI, Next.js, PostgreSQL with pgvector, realtime voice APIs, AI agents with tool calling and RAG. Also React, Node.js, Supabase, Docker, AWS (S3, EC2, Lambda), GitHub Actions, LangChain, Stripe webhooks. Has used Rust, Go, Kubernetes, fine-tuning and model training.",
    text: "Ariv's strongest technical skills: Python, TypeScript, FastAPI, Next.js, PostgreSQL with pgvector, realtime voice APIs, and building AI agents with tool calling and RAG. Also comfortable with React, Node.js, Supabase, Docker, AWS (S3, EC2, Lambda), GitHub Actions CI, LangChain and Stripe webhooks. He has also used Rust, Go, Kubernetes, fine-tuning and model training. On the non-technical side he's good at project coordination: running follow-ups, keeping owners and due dates straight, and working with non-technical teams.",
    keywords: ["skills", "skill", "good", "strong", "strongest", "stack", "languages", "python", "typescript", "react", "aws", "cloud", "docker", "sql", "postgres", "tech", "technical", "know", "rust", "go", "golang", "kubernetes", "k8s", "fine-tuning", "training", "tuning"],
  },
  {
    id: "experience",
    topic: "Experience",
    text: "Ariv is early in his career, and he's covered a lot of ground for it: software engineering work at Hyundai, a product internship at a startup, AI agents, open source merged into agent frameworks, customer-facing manufacturing programs, and products he builds himself. Years tell you how long someone's been around, not how much ground they've covered.",
    keywords: ["experience", "years", "junior", "senior", "staff", "seniority", "level", "early", "career", "young", "qualified"],
  },
  {
    id: "credentials",
    topic: "Titles and certifications",
    text: "Ariv has no AWS certification or any other certification. He hasn't held the title software engineer. At Hyundai he did software engineering work as an intern; only the title was different.",
    keywords: ["certified", "certification", "certifications", "cert", "certs", "credential", "credentials", "title", "titles"],
  },
  {
    id: "limits",
    topic: "Relocation and logistics",
    card: "Authorized to work. Open to relocating for the right opportunity, especially to work closely with strong engineering and AI teams.",
    text: "Ariv is authorized to work. He's open to relocating for the right opportunity, especially to work closely with strong engineering and AI teams. Salary, start dates and remote preferences are his to answer.",
    keywords: ["visa", "h1b", "h-1b", "sponsorship", "authorization", "salary", "relocate", "relocating", "start", "remote", "pay", "compensation"],
  },
  {
    id: "role-fit-fde",
    topic: "Fit for forward-deployed and applied AI roles",
    text: "Why Ariv fits forward-deployed and applied AI roles: his day job already works like one, bridging his company and the other companies on a project and keeping engineering, quality and sales aligned, so he's used to translating between teams and chasing things to done. On the side he builds the technical half himself: this voice agent, forecost, and bug fixes in agent frameworks like Agno.",
    keywords: ["forward", "deployed", "deployment", "fde", "applied", "solutions", "customer", "facing", "fit", "hire", "why"],
  },
  {
    id: "role-fit-coordination",
    topic: "Fit for program, project, product and analyst roles",
    text: "Why Ariv fits product management, program, project and analyst roles: he's drawn to product management, and his day job already has him running follow-ups, owners and due dates across engineering, quality, production and sales. He has a master's in Business Analytics, and he's technical enough to build his own tools and agents, so he can talk to engineers in their language.",
    keywords: ["program", "project", "product", "manager", "pm", "tpm", "analyst", "analytics", "business", "operations", "ops", "coordinator", "coordination", "fit", "hire", "why"],
  },
  {
    id: "role-fit-swe",
    topic: "Fit for software and AI engineer roles",
    text: "Why Ariv fits software and AI engineer roles: he builds full stack in Python and TypeScript, did software engineering work at Hyundai, has shipped a working realtime voice agent with tool calling, maintains an open source Python package with CI across operating systems, and has had bug fixes merged into agent frameworks.",
    keywords: ["software", "engineer", "swe", "ai", "ml", "developer", "backend", "full", "stack", "fit", "hire", "why"],
  },
];

/** Numbers the agent may say about Ariv (anything else is invented). */
export const ALLOWED_NUMBERS = ["2023", "2024", "2026", "601", "2", "3", "3.8", "4", "15", "16", "24", "25"];

/** The short version, inlined in the prompt. */
export function renderFactCard(): string {
  return FACTS.filter((f) => f.card).map((f) => `- ${f.topic}: ${f.card}`).join("\n");
}

export function renderLinks(): string {
  return (Object.keys(LINKS) as LinkKey[])
    .map((k) => `${LINK_LABELS[k]}: ${LINKS[k]}`)
    .join("\n");
}

const STOP = new Set(
  "a an and are as at be but by can did do does for from has have he her his how i in is it its me my of on or so tell that the their them they this to was what when where which who why will with you your about ariv arivs".split(" "),
);

/** How speech-to-text and people say things, mapped to the words the facts use. */
const SPOKEN_VARIANTS: [RegExp, string][] = [
  [/\b(?:for|four|fore) ?cost\b|\bforecast (?:tool|package|project)\b/g, "forecost"],
  [/\bmal ?b[ai]t\b|\bmall bit\b/g, "malbit"],
  [/\bregistr(?:um|ar|y)\b|\bregister [au]m\b/g, "registrum"],
  [/\bagnel?o\b|\bagno\b|\bag no\b/g, "agno"],
  [/\bnemo curator\b|\bnimo\b/g, "nemo"],
  [/\bpg vector\b|\bpostgres vector\b/g, "pgvector"],
  [/\bbarge in\b/g, "barge-in"],
  [/\bfine tuning\b/g, "fine-tuning"],
  [/\bh ?1 ?b\b/g, "h1b"],
];

const SYNONYMS: Record<string, string> = {
  degree: "education",
  college: "university",
  studied: "education",
  pay: "salary",
  compensation: "salary",
  wfh: "remote",
  hallucinate: "hallucination",
  cert: "certification",
  certs: "certification",
  mistakes: "weakness",
  faults: "weakness",
  interrupted: "interrupt",
  interruptions: "interrupt",
  delay: "latency",
  lag: "latency",
};

function tokens(s: string): string[] {
  const spoken = SPOKEN_VARIANTS.reduce((out, [re, to]) => out.replace(re, to), s.toLowerCase());
  return spoken
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t))
    .map((t) => SYNONYMS[t] ?? t);
}

/** Tiny keyword search over FACTS; the whole KB is ~30 entries so this is exact and instant. */
export function searchFacts(query: string, k = 3): Fact[] {
  const q = tokens(query);
  if (q.length === 0) return [];
  const scored = FACTS.map((f) => {
    const kw = new Set(f.keywords.map((w) => SYNONYMS[w] ?? w));
    const body = new Set(tokens(`${f.topic} ${f.text}`));
    let score = 0;
    for (const t of q) {
      if (kw.has(t)) score += 3;
      else if (body.has(t)) score += 1;
    }
    return { f, score };
  })
    // At least one real keyword hit; a single overlapping common word isn't a match.
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((x) => x.f);
}
