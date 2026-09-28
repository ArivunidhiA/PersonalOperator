// Seed the knowledge_base table with Ariv's story bank chunks + embeddings
// Run: node scripts/seed-knowledge.mjs (from web/) or node web/scripts/seed-knowledge.mjs (from project root)

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webDir = join(__dirname, "..");
config({ path: join(webDir, ".env") });
config({ path: join(webDir, ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.error("Set OPENAI_API_KEY in .env");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const CHUNKS = [
  {
    content:
      "Ariv (Arivunidhi Anna Arivan) lives in Alabama. He has an MS in Business Analytics from Northeastern University (Boston) and a B.Tech in Computer Science from SRM Institute of Science and Technology in India. Right now he works full-time as a Client Project Coordinator at INZI Controls, an automotive parts supplier. On the side he builds AI agents and developer tools. He's looking for applied AI, AI engineer, and forward-deployed engineer roles. Email: annaarivan.a@northeastern.edu. Scheduling: calendly.com/annaarivan-a-northeastern.",
    metadata: { category: "bio" },
  },
  {
    content:
      "INZI Controls: Ariv's current full-time job (June 2026 to now), Client Project Coordinator at an automotive parts supplier. He runs the weekly follow-up loop with the customer on launch programs (meeting notes, action items, owners, due dates), chases open issues across engineering, quality and sales until they close, and keeps launch documents and status updates current. It's a coordination role, not an engineering role. Never name the customer, programs, or parts.",
    metadata: { category: "work", company: "INZI Controls" },
  },
  {
    content:
      "forecost is Ariv's open source project (MIT license, Python, on PyPI). It logs what AI coding agents like Claude Code (and apps using LiteLLM) spend into a local SQLite ledger, without storing your prompts, and enforces budgets so an agent can't run away overnight. CI runs on 3 operating systems and 4 Python versions, with a privacy test that checks no prompt content leaks. It's alpha and Ariv is the main user so far.",
    metadata: { category: "project", project: "forecost" },
  },
  {
    content:
      "The honest part of forecost: Ariv tried to make it predict what agent runs would cost. He tested the prediction on 601 of his own agent turns and the range was way too wide to be useful, so he shipped the logging and budget parts and left the prediction switched off. He'd rather show a trustworthy log than a pretty wrong number.",
    metadata: { category: "project", project: "forecost" },
  },
  {
    content:
      "This voice agent (Ariv's AI Operator at arivsai.app) is one of Ariv's projects. It's built on the OpenAI Realtime API over WebRTC with Next.js and TypeScript. It has tools for looking things up in a small knowledge base (RAG over Postgres with pgvector), checking Ariv's calendar and booking a meeting, researching a caller's role or company, remembering returning callers, and sending a follow-up email. It has rate limiting, tests, and CI.",
    metadata: { category: "project", project: "AI Operator" },
  },
  {
    content:
      "Ariv's open source contributions: two merged bug fixes in Agno, an agent framework (one fixed streaming token usage being counted twice for Anthropic models, the other fixed shared state in tool-call parsing), both with regression tests. Two merged changes in NVIDIA NeMo Curator. Three documentation fixes in PyTorch AO. Two small features in PaperBanana. All merged in early 2026.",
    metadata: { category: "project", project: "open source" },
  },
  {
    content:
      "Ralph Loop Arena is a small experiment Ariv built: it runs a fresh-context coding agent (the Ralph loop pattern, credit to Geoffrey Huntley) against a standard long-context agent on the same task, so you can watch context rot happen. FastAPI backend that calls real LLMs, React front end.",
    metadata: { category: "project", project: "Ralph Loop Arena" },
  },
  {
    content:
      "Serotonin: Ariv was a product intern at Serotonin, a Web3 startup, in summer 2024 (June to September), remote. He owned the data layer behind the company's events calendar and kept adding new data sources to it, and built small internal tools in Python and FastAPI to replace manual updates. He worked with LangChain, Pinecone, PostHog and Datadog. His manager there, Michael Williams (Head of Product), wrote him a LinkedIn recommendation.",
    metadata: { category: "work", company: "Serotonin" },
  },
  {
    content:
      "Hyundai: Ariv interned at Hyundai Motor India in Chennai in 2023. He wrote Python and TensorFlow code for a vehicle-data team, packaged it in Docker, and shipped it through Jenkins CI/CD to AWS. It was his first time writing code that had to run somewhere other than his laptop.",
    metadata: { category: "work", company: "Hyundai" },
  },
  {
    content:
      "Volunteer work: Ariv did volunteer developer work for two nonprofits. These were volunteer roles, not jobs. At Crossroads of Michigan (summer 2024, alongside his Serotonin internship) he connected Stripe donations to Salesforce, with webhook retries so a failed event didn't create a duplicate donor record. His takeaway: the hardest bugs live in the spaces between systems. At Bright Mind Enrichment, a community wellness nonprofit, he built a volunteer coordination app (React, Node.js, Firebase notifications) after finishing his master's. That volunteer role ended in 2026, before he joined INZI.",
    metadata: { category: "volunteering" },
  },
  {
    content:
      "Ariv's technical skills. Strongest: Python, TypeScript, FastAPI, Next.js, PostgreSQL with pgvector, the OpenAI Realtime API, building AI agents with tool calling and RAG. Also comfortable with: React, Node.js, Supabase, Docker, AWS (S3, EC2, Lambda), GitHub Actions CI, LangChain, Stripe webhooks. If someone asks about something not listed, say you don't think he's used it much.",
    metadata: { category: "skills" },
  },
  {
    content:
      "Ariv's links: LinkedIn: https://www.linkedin.com/in/arivunidhi-anna-arivan/ — GitHub: https://github.com/ArivunidhiA — X (Twitter): https://twitter.com/Ariv_2012 — Email: annaarivan.a@northeastern.edu — Book a meeting: https://calendly.com/annaarivan-a-northeastern/15-min-coffee-chat",
    metadata: { category: "links", type: "profiles" },
  },
  {
    content:
      "When someone asks for Ariv's resume: say you can't send the file yourself, but his LinkedIn has everything and he's happy to email his resume. Include his LinkedIn https://www.linkedin.com/in/arivunidhi-anna-arivan/ and GitHub https://github.com/ArivunidhiA in your response. Never read URLs out loud.",
    metadata: { category: "links", type: "resume" },
  },
  {
    content:
      "Ariv's project links: forecost (open source AI agent cost ledger): GitHub https://github.com/ArivunidhiA/forecost and PyPI https://pypi.org/project/forecost/ — This voice agent: https://github.com/ArivunidhiA/PersonalOperator — Ralph Loop Arena: https://github.com/ArivunidhiA/Ralph-vs-traditional-agent",
    metadata: { category: "links", type: "projects" },
  },
  {
    content:
      "Why Ariv fits forward-deployed and applied AI roles: his day job is customer-facing coordination, keeping a real product launch moving across engineering, quality and sales teams, so he's used to working with non-technical people and chasing things to done. On the side he builds the technical half himself: this voice agent (realtime voice, tools, RAG), forecost (cost tracking and budgets for AI agents), and bug fixes in agent frameworks like Agno. He's early in his career, so be honest about that: he's strongest as a builder who ships small real things and learns fast.",
    metadata: { category: "role_fit", role_type: "forward_deployment_engineer" },
  },
  {
    content:
      "Why Ariv fits software and AI engineer roles: he builds full stack in Python and TypeScript, has shipped a working realtime voice agent with tool calling and RAG, maintains an open source Python package with CI across operating systems, and has had bug fixes merged into agent frameworks. Be honest that his professional engineering experience is internships; his strongest proof is the stuff he's built and shipped himself.",
    metadata: { category: "role_fit", role_type: "software_engineer" },
  },
];

async function embed(text) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });
  const data = await res.json();
  return data.data[0].embedding;
}

async function main() {
  console.log(`Seeding ${CHUNKS.length} chunks...`);

  // Clear existing data
  await sb.from("knowledge_base").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  console.log("Cleared existing knowledge_base rows.");

  for (let i = 0; i < CHUNKS.length; i++) {
    const chunk = CHUNKS[i];
    console.log(`[${i + 1}/${CHUNKS.length}] Embedding: ${chunk.content.slice(0, 60)}...`);
    const embedding = await embed(chunk.content);

    const { error } = await sb.from("knowledge_base").insert({
      content: chunk.content,
      metadata: chunk.metadata,
      embedding: embedding,
    });

    if (error) {
      console.error(`  Error inserting chunk ${i + 1}:`, error.message);
    } else {
      console.log(`  ✓ Inserted.`);
    }
  }

  console.log("\nDone! Knowledge base seeded.");
}

main().catch(console.error);
