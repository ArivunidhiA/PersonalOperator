/**
 * Single source of truth for everything the agent may say about Ariv.
 *
 * - The voice prompt inlines renderFactCard(), so most questions need no tool call.
 * - retrieve_knowledge searches FACTS in memory.
 * - scripts/seed-knowledge.mjs seeds Supabase knowledge_base from FACTS.
 * - __tests__/knowledge.test.ts keeps prompts, seed and facts from drifting.
 *
 * Keep this file dependency-free: the seed script imports it with plain Node.
 * Rules for editing: only true, verifiable things; no metrics we can't back up;
 * never name INZI's customers, programs or parts.
 */

export type Fact = {
  id: string;
  topic: string;
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
  "a realtime speech-to-speech model, a small knowledge base about Ariv, and a few tools for his calendar and links. The site is Next.js and TypeScript on Vercel, with Supabase for storage";

export const FACTS: Fact[] = [
  {
    id: "bio",
    topic: "Who Ariv is",
    text: "Ariv (full name Arivunidhi Anna Arivan) lives in Alabama. He has a master's in Business Analytics from Northeastern University in Boston and a B.Tech in Computer Science from SRM Institute of Science and Technology in India. He's early in his career. He's most drawn to AI engineering, product management and software engineering, including applied AI and forward-deployed roles.",
    keywords: ["who", "about", "background", "education", "degree", "school", "university", "northeastern", "srm", "master", "masters", "live", "location", "where", "alabama", "looking", "roles"],
  },
  {
    id: "direction",
    topic: "What Ariv is into and where he's headed",
    text: "Ariv is inclined toward AI engineering, product management and software engineering. He works on AI engineering every day on his own, building agents, voice agents and developer tools and shipping them, so that's the lens to see him through, whatever his current title says.",
    keywords: ["direction", "goal", "goals", "interested", "interests", "passion", "want", "wants", "looking", "headed", "future", "career", "inclined", "focus", "ai", "engineering", "product", "management", "pm", "software", "every", "daily", "day"],
  },
  {
    id: "current-job",
    topic: "Current job",
    text: "Right now Ariv works full-time at INZI Controls, an automotive parts supplier, as a Client Project Coordinator. He started in June 2026. The title says coordinator, but the work is basically forward-deployed: he's the bridge between INZI and the other companies on a project, translating what each side needs, keeping engineering, quality, production and sales aligned across companies, and driving open issues until they close. The one difference from a forward-deployed engineer is that he doesn't go into the other company to build or fix their software.",
    keywords: ["job", "work", "current", "currently", "now", "today", "inzi", "controls", "coordinator", "client", "project", "day", "role", "employer", "company", "automotive", "forward", "deployed", "bridge"],
  },
  {
    id: "current-projects",
    topic: "What he's building right now",
    text: "Right now Ariv is building two things on his own. Registrum is an AI design agent. Malbit is a translation app, built to make talking across languages a lot less painful. Same pattern as always: find something annoying, then spend an unreasonable amount of time fixing it. Both are works in progress, so keep it to that and offer a walkthrough with Ariv instead of inventing features.",
    keywords: ["registrum", "malbit", "design", "translation", "translate", "current", "currently", "now", "working", "building", "projects", "side", "new"],
  },
  {
    id: "free-time",
    topic: "Free time and schedule",
    text: "Ariv's day job takes most of his day, so whatever time survives goes to his own engineering projects and his health. Outside work he's basically trying to become a polymath: software, AI, woodworking, art, the gym, and he plays guitar (plays might be generous; he's learning).",
    keywords: ["free", "time", "hobby", "hobbies", "fun", "weekend", "outside", "personal", "gym", "woodworking", "art", "guitar", "music", "health", "schedule", "busy"],
  },
  {
    id: "engineer-or-coordinator",
    topic: "Engineer or coordinator?",
    text: "Ariv is an engineer at heart, with project management skills on top. He joined INZI because the company needed someone to bridge customers, engineering, production and timelines, a gap he could fill from day one. Then he started noticing engineering problems at the firm too and picked those up as well, so now he does a bit of both. He likes finding a problem, digging into why it happens and figuring out the fix, and the project management side gets the right people moving.",
    keywords: ["engineer", "coordinator", "technical", "both", "which", "really", "heart", "gap", "gaps", "problem", "problems", "solve"],
  },
  {
    id: "how-he-works",
    topic: "How he works",
    text: "Ariv's creativity is practical: he doesn't sit around looking for a cool project, he notices something that sucks, asks why, and starts building. His path has been a mix: software, data, AI, automotive manufacturing, project coordination, open source and his own products, so don't judge him only by his job title. He does best when a problem isn't perfectly defined yet. Does he ship fast? This voice agent is one of the things he shipped.",
    keywords: ["creative", "creativity", "ship", "ships", "fast", "speed", "quick", "how", "works", "think", "thinks", "approach", "style", "messy", "ambiguous", "ambiguity", "title", "else", "know"],
  },
  {
    id: "weakness",
    topic: "His real weakness",
    text: "Ariv's real weakness: he takes on too much. If he sees five interesting problems, he wants to solve six. He's gotten better at prioritizing, but saying not now is still a work in progress.",
    keywords: ["weakness", "weaknesses", "weak", "flaw", "flaws", "bad", "downside", "reason", "not", "hire", "improve", "prioritize", "prioritizing"],
  },
  {
    id: "where-he-wants-to-work",
    topic: "Where he wants to work",
    text: "Where Ariv wants to work: he keeps the list to himself, but it has some big names you'd know. What he's aiming for is AI engineering, product and software roles, including applied AI and forward-deployed work, and he's open to relocating for the right opportunity.",
    keywords: ["where", "want", "wants", "companies", "company", "dream", "target", "list", "looking", "relocate", "relocating", "move", "next"],
  },
  {
    id: "forecost",
    topic: "forecost",
    text: "forecost is Ariv's open source project (MIT license, Python, on PyPI), a flight recorder for AI agent work. It logs what coding agents like Claude Code, and apps using LiteLLM, actually spend into a local SQLite ledger without storing your prompts, reconciles meters that disagree, and enforces budgets so an agent can't run away overnight. Its burn command projects your spending against your budget: a fuel gauge for your AI bill instead of a receipt at the end. CI runs on 3 operating systems and 4 Python versions, with a privacy test that checks no prompt content leaks. It's alpha, and Ariv is the main user so far.",
    keywords: ["forecost", "for cost", "cost", "costs", "budget", "ledger", "spend", "open", "source", "pypi", "python", "package", "claude", "litellm", "burn", "bill"],
  },
  {
    id: "forecost-honest",
    topic: "forecost: the part he left out",
    text: "Ariv first tried to make forecost predict what agent runs would cost. He tested the prediction on 601 of his own agent turns and the range was too wide to be useful, so he shipped the logging and budget parts and left prediction switched off. He'd rather show a trustworthy log than a pretty wrong number.",
    keywords: ["forecost", "predict", "prediction", "forecast", "forecasting", "estimate", "honest", "failure", "lesson"],
  },
  {
    id: "voice-agent",
    topic: "This voice agent",
    text: `This voice agent is one of Ariv's projects. It runs on ${AGENT_STACK}. He built it with AI coding tools along the way: the voice pipeline, the tools, rate limiting, tests and CI. The code is on his GitHub.`,
    keywords: ["you", "this", "agent", "voice", "built", "build", "made", "how", "llm", "model", "platform", "stack", "architecture", "operator", "arivsai", "openai", "gemini", "ai"],
  },
  {
    id: "open-source",
    topic: "Open source contributions",
    text: "Ariv's open source contributions, all merged in early 2026: two bug fixes in Agno, an agent framework (one stopped streaming token usage from being counted twice for Anthropic models, the other fixed shared state in tool-call parsing), both with regression tests. Two merged changes in NVIDIA NeMo Curator. Three documentation fixes in PyTorch AO. Two small features in PaperBanana.",
    keywords: ["open", "source", "contributions", "oss", "agno", "nemo", "curator", "nvidia", "pytorch", "ao", "paperbanana", "merged", "pr", "prs", "pull", "github"],
  },
  {
    id: "ralph",
    topic: "Ralph Loop Arena",
    text: "Ralph Loop Arena is a small experiment Ariv built. It runs a fresh-context coding agent (the Ralph loop pattern, credit to Geoffrey Huntley) against a standard long-context agent on the same task, so you can watch context rot happen. FastAPI backend that calls real LLMs, React front end.",
    keywords: ["ralph", "loop", "arena", "context", "rot", "experiment", "coding", "agent"],
  },
  {
    id: "serotonin",
    topic: "Serotonin internship",
    text: "Ariv was a product intern at Serotonin, a Web3 startup, in summer 2024 (June to September), remote. He owned the data layer behind the company's events calendar and kept adding new data sources to it, and he built small internal tools in Python and FastAPI to replace manual updates. He worked with LangChain, Pinecone, PostHog and Datadog.",
    keywords: ["serotonin", "web3", "intern", "internship", "product", "2024", "summer", "events", "calendar", "fastapi", "langchain", "pinecone"],
  },
  {
    id: "hyundai",
    topic: "Hyundai internship",
    text: "Ariv interned at Hyundai Motor India in Chennai in 2023. He wrote Python and TensorFlow code for a vehicle-data team, packaged it in Docker, and shipped it through Jenkins CI/CD to AWS. It was his first time writing code that had to run somewhere other than his laptop.",
    keywords: ["hyundai", "intern", "internship", "2023", "chennai", "india", "tensorflow", "vehicle", "docker", "jenkins", "aws"],
  },
  {
    id: "volunteer",
    topic: "Volunteer work",
    text: "Ariv did volunteer developer work for two nonprofits. These were volunteer roles, not jobs. At Crossroads of Michigan (summer 2024, alongside his Serotonin internship) he connected Stripe donations to Salesforce, with webhook retries so a failed event didn't create a duplicate donor record. His takeaway: the hardest bugs live in the spaces between systems. At Bright Mind Enrichment, a community wellness nonprofit, he built a volunteer coordination app (React, Node.js, Firebase notifications) after finishing his master's. That volunteer role ended in 2026, before he joined INZI.",
    keywords: ["volunteer", "volunteering", "nonprofit", "crossroads", "michigan", "bright", "mind", "enrichment", "stripe", "salesforce", "firebase", "react"],
  },
  {
    id: "skills",
    topic: "Skills",
    text: "Ariv's strongest technical skills: Python, TypeScript, FastAPI, Next.js, PostgreSQL with pgvector, realtime voice APIs, and building AI agents with tool calling and RAG. Also comfortable with React, Node.js, Supabase, Docker, AWS (S3, EC2, Lambda), GitHub Actions CI, LangChain and Stripe webhooks. On the non-technical side he's good at project coordination: running follow-ups, keeping owners and due dates straight, and working with non-technical teams. He has no AWS certification. If a skill isn't mentioned anywhere in FACTS, say you don't think he's used it much.",
    keywords: ["skills", "skill", "good", "strong", "strongest", "stack", "languages", "python", "typescript", "react", "aws", "cloud", "docker", "sql", "postgres", "certified", "certification", "tech", "technical", "know"],
  },
  {
    id: "limits",
    topic: "What's not true or not known",
    text: "Things to be straight about: Ariv has not held a software engineer title; his engineering experience is internships, volunteer projects and what he's built himself. He has no AWS or other certifications. He's open to relocating for the right opportunity, especially to work closely with strong engineering and AI teams. For visa or work authorization, salary, start dates, remote preferences or anything personal, the honest answer is to ask Ariv directly.",
    keywords: ["certified", "certification", "aws", "senior", "years", "experience", "title", "engineer", "visa", "h1b", "h-1b", "sponsorship", "authorization", "salary", "relocate", "start"],
  },
  {
    id: "role-fit-fde",
    topic: "Fit for forward-deployed and applied AI roles",
    text: "Why Ariv fits forward-deployed and applied AI roles: his day job already works like one, bridging his company and the other companies on a project and keeping engineering, quality and sales aligned, so he's used to translating between teams and chasing things to done. On the side he builds the technical half himself: this voice agent, forecost, and bug fixes in agent frameworks like Agno. He's early in his career, so the honest pitch is a builder who ships small real things and learns fast.",
    keywords: ["forward", "deployed", "deployment", "fde", "applied", "solutions", "customer", "facing", "fit", "hire", "why"],
  },
  {
    id: "role-fit-coordination",
    topic: "Fit for program, project, product and analyst roles",
    text: "Why Ariv fits product management, program, project and analyst roles: he's drawn to product management, and his day job already has him running follow-ups, owners and due dates across engineering, quality, production and sales. He has a master's in Business Analytics, and he's technical enough to build his own tools and agents, so he can talk to engineers in their language. He's early in his career, so it's a fit for roles that value range and follow-through over years of experience.",
    keywords: ["program", "project", "product", "manager", "pm", "tpm", "analyst", "analytics", "business", "operations", "ops", "coordinator", "coordination", "fit", "hire", "why"],
  },
  {
    id: "role-fit-swe",
    topic: "Fit for software and AI engineer roles",
    text: "Why Ariv fits software and AI engineer roles: he builds full stack in Python and TypeScript, has shipped a working realtime voice agent with tool calling, maintains an open source Python package with CI across operating systems, and has had bug fixes merged into agent frameworks. His professional engineering experience is internships; his strongest proof is what he's built and shipped himself.",
    keywords: ["software", "engineer", "swe", "ai", "ml", "developer", "backend", "full", "stack", "fit", "hire", "why"],
  },
];

/** Numbers the agent may say about Ariv (anything else is invented). */
export const ALLOWED_NUMBERS = ["2023", "2024", "2026", "601", "2", "3", "4", "15", "24"];

export function renderFactCard(): string {
  return FACTS.map((f) => `- ${f.topic}: ${f.text}`).join("\n");
}

export function renderLinks(): string {
  return (Object.keys(LINKS) as LinkKey[])
    .map((k) => `${LINK_LABELS[k]}: ${LINKS[k]}`)
    .join("\n");
}

const STOP = new Set(
  "a an and are as at be but by can did do does for from has have he her his how i in is it its me my of on or so tell that the their them they this to was what when where which who why will with you your about ariv arivs".split(" "),
);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t));
}

/** Tiny keyword search over FACTS; the whole KB is ~15 entries so this is exact and instant. */
export function searchFacts(query: string, k = 3): Fact[] {
  const q = tokens(query);
  if (q.length === 0) return [];
  const scored = FACTS.map((f) => {
    const kw = new Set(f.keywords);
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
