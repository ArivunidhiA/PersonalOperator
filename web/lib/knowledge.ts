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
    text: "Right now Ariv works full-time at INZI Controls, an automotive parts supplier, as a Client Project Coordinator. He started in June 2026. Coordination is a big part of it, running the weekly follow-up loop on projects (meeting notes, action items, owners, due dates) and chasing open issues across engineering, quality, production and sales until they close, but it isn't the whole job, and it isn't where he's headed: he's most drawn to AI engineering, product management and software engineering.",
    keywords: ["job", "work", "current", "currently", "now", "today", "inzi", "controls", "coordinator", "client", "project", "day", "role", "employer", "company", "automotive"],
  },
  {
    id: "builder",
    topic: "What he builds on the side",
    text: "Ariv builds every day on his own: AI agents, voice agents and developer tools, mostly in Python and TypeScript. It's not a side interest, it's what he does daily, and this voice agent is one of the things he built. He ships small real things and learns fast.",
    keywords: ["build", "builds", "side", "projects", "hobby", "free", "time", "ship", "ships", "creative"],
  },
  {
    id: "forecost",
    topic: "forecost",
    text: "forecost is Ariv's open source project (MIT license, Python, on PyPI). It logs what AI coding agents like Claude Code, and apps using LiteLLM, spend into a local SQLite ledger without storing your prompts, and it enforces budgets so an agent can't run away overnight. CI runs on 3 operating systems and 4 Python versions, with a privacy test that checks no prompt content leaks. It's alpha, and Ariv is the main user so far.",
    keywords: ["forecost", "for cost", "cost", "costs", "budget", "ledger", "spend", "open", "source", "pypi", "python", "package", "claude", "litellm"],
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
    text: `This voice agent is one of Ariv's projects. It runs on ${AGENT_STACK}. He built it, using AI coding tools along the way, like he does for most things he builds: the voice pipeline, the tools, rate limiting, tests and CI.`,
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
    text: "Things to be straight about: Ariv has not held a software engineer title; his engineering experience is internships, volunteer projects and what he's built himself. He has no AWS or other certifications. For visa or work authorization, salary, start dates or anything personal, the honest answer is to ask Ariv directly.",
    keywords: ["certified", "certification", "aws", "senior", "years", "experience", "title", "engineer", "visa", "h1b", "h-1b", "sponsorship", "authorization", "salary", "relocate", "start"],
  },
  {
    id: "role-fit-fde",
    topic: "Fit for forward-deployed and applied AI roles",
    text: "Why Ariv fits forward-deployed and applied AI roles: his day job is cross-team coordination, keeping projects moving across engineering, quality and sales teams, so he's used to working with non-technical people and chasing things to done. On the side he builds the technical half himself: this voice agent, forecost, and bug fixes in agent frameworks like Agno. He's early in his career, so the honest pitch is a builder who ships small real things and learns fast.",
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
export const ALLOWED_NUMBERS = ["2023", "2024", "2026", "601", "2", "3", "4", "15"];

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
