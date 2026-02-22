// Seed the knowledge_base table with Ariv's story bank chunks + embeddings
// Run: node scripts/seed-knowledge.mjs

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env" });

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
      "Ariv (Arivunidhi Anna Arivan) is based in Boston, MA. He's doing his MS in Business Analytics at Northeastern University. He got his BS in Computer Science from SRM Institute of Science and Technology in India. Email: annaarivan.a@northeastern.edu. Scheduling: calendly.com/annaarivan-a-northeastern.",
    metadata: { category: "bio" },
  },
  {
    content:
      "LLMLab is Ariv's current open source project (Feb 2026–present). It's a developer tool for real-time visibility into LLM API costs. It acts as a proxy layer — swap your API key for an LLMLab key, and every call gets logged, costed, and surfaced in a real-time dashboard. Zero code changes needed. Tech: FastAPI, Python, PostgreSQL (Supabase), Next.js 14, React, TypeScript, Tailwind CSS, Redis caching, Railway + Vercel deployment, GitHub Actions CI/CD. Also has a Python CLI and SDK.",
    metadata: { category: "project", project: "LLMLab" },
  },
  {
    content:
      "LLMLab key results: Sub-45ms API response time, cost calculation in ~3ms per event, 8 merged PRs from open source contributors, multi-provider support (OpenAI, Anthropic, Google Gemini). Notable technical work: Built an async SSE streaming proxy that intercepts LLM streams for cost calculation without blocking downstream responses. Uses tiktoken for client-side token counting. Also built anomaly detection (Z-score based), cost forecasting (linear regression over 14 days), and project tagging for cost attribution.",
    metadata: { category: "project", project: "LLMLab" },
  },
  {
    content:
      "Bright Mind Enrichment — Software Engineer (Nov 2025–Present), Boston, MA. Community wellness nonprofit with 1,000+ volunteers across 12 states. Ariv built a volunteer coordination platform in React and Node.js with real-time geolocation and push notifications via Firebase Cloud Messaging. Used Haversine formula for proximity matching. Result: 40% reduction in volunteer response time for urgent community outreach.",
    metadata: { category: "work", company: "Bright Mind" },
  },
  {
    content:
      "At Bright Mind, Ariv built a donor management system with Stripe API — automated receipts, tax documentation, webhook handling with full idempotency on every transaction. Result: 35% reduction in admin overhead, handles hundreds of donors. Also built an email validation layer with exponential backoff retry logic. Result: 90% reduction in data sync errors (from 200+ failed campaigns/month to near zero).",
    metadata: { category: "work", company: "Bright Mind" },
  },
  {
    content:
      "Serotonin — Software Engineer (Mar 2025–Nov 2025), New York, NY (Remote). Web3 marketing and communications startup. Ariv built a RAG-based AI customer support system using LangChain + Pinecone on AWS EC2. Ingested 500+ support docs. Result: response time from 2 hours to 30 seconds, 12,000+ queries in first month, 99.9% uptime, sub-200ms P99 latency.",
    metadata: { category: "work", company: "Serotonin" },
  },
  {
    content:
      "At Serotonin, Ariv built an automated blockchain event pipeline processing 5,000+ events/day from 3+ platforms with on-chain verification. Two-stage pipeline: immediate ingestion then async verification. Result: 99% data freshness, 15+ hours/week manual work eliminated. Also set up DataDog distributed tracing across all pipeline services. Found and fixed race conditions, timeout misconfigurations, and backpressure issues. Result: 25+ recurring production incidents resolved.",
    metadata: { category: "work", company: "Serotonin" },
  },
  {
    content:
      "At Serotonin, Ariv built a microservices OAuth architecture with unified API gateway for 5+ integrations. There was a real disagreement about whether to build a unified gateway or let each service handle its own auth. Ariv argued that with 5+ integrations and real security exposure, inconsistent auth was a bigger long-term risk. Put together a short doc laying out specific risk scenarios. They aligned on the gateway and it caught unauthorized access attempts after launch. Result: 100% unauthorized access prevention.",
    metadata: { category: "work", company: "Serotonin" },
  },
  {
    content:
      "Crossroads Community Services — Software Engineer (Aug 2024–Mar 2025), Dallas, TX (Remote). Nonprofit focused on community services. Ariv built a serverless data pipeline (AWS Lambda + S3) syncing 10,000+ records/day from Salesforce. Result: 87.5% time savings. Built payment processing backend with Stripe — full idempotency, webhook validation, OAuth for donors. Result: $90,000+ donations processed, 99.8% accuracy, 0 critical failures.",
    metadata: { category: "work", company: "Crossroads" },
  },
  {
    content:
      "At Crossroads, Ariv fixed Stripe webhook duplicate issue by adding idempotency table and moving heavy processing to async Celery task queue. Result: 95% reduction in duplicate transactions. Also optimized Salesforce API queries — replaced SELECT *, fixed N+1 patterns, switched to Bulk API 2.0, added Redis caching. Result: 8.2s to 2.9s (65% improvement).",
    metadata: { category: "work", company: "Crossroads" },
  },
  {
    content:
      "Hyundai Motors — Software Engineer (Feb 2023–Aug 2023), Chennai, India. Connected vehicle platform team. Ariv built a Python telemetry microservice collecting 50M+ data points/day from 10,000+ vehicles via MQTT. Used delta encoding and gzip compression to reduce 3.2GB daily network payload. Storage in AWS S3 data lake with Parquet format.",
    metadata: { category: "work", company: "Hyundai" },
  },
  {
    content:
      "At Hyundai, Ariv built an AI-powered driver safety system using TensorFlow — real-time distraction and fatigue detection from camera + sensor data. CNN for image-based features (eye closure, head tilt) + gradient boosted classifier combining image + sensor signals. Deployed in Docker with TensorFlow Serving via gRPC. Sub-150ms inference latency. Jenkins CI/CD with 95% test coverage.",
    metadata: { category: "work", company: "Hyundai" },
  },
  {
    content:
      "Research & Achievements: Published research — 'Cryptocurrency Price Prediction Using Machine Learning' in Seybold Report Vol 18, pages 2351–2358. Compared LSTM, Random Forest, XGBoost, and ARIMA on 5 years of Bitcoin/Ethereum data. LSTM achieved lowest MAE. Also built a missing person identification system using FaceNet embeddings + cosine similarity. 78% recall, 12% false positive rate. Won 1st place at SRM Hackathon 2023 (100+ teams) with a real-time fraud detection system. Open source: 8 merged PRs across 5 repos (OpenAI, Meta, PyTorch, LLMLite).",
    metadata: { category: "research" },
  },
  {
    content:
      "Ariv's technical skills — Strong: Python, FastAPI, PostgreSQL, Stripe API, AWS (Lambda, S3, EC2). Comfortable: Node.js, React, TypeScript, Docker, Redis, LangChain, TensorFlow. Also used in production: Jenkins CI/CD, DataDog, Pinecone, Web3.py, Celery, Firebase Cloud Messaging, MQTT, OAuth 2.0, Salesforce/SOQL.",
    metadata: { category: "skills" },
  },
  {
    content:
      "Key numbers: Bright Mind — 1,000+ volunteers, 12 states, 40% faster response time, 35% less admin overhead. Serotonin — 2hr to 30s support response, 12,000+ queries/month, 5,000+ events/day, 25+ incidents resolved. Crossroads — 10,000+ records/day, $90K+ donations, 99.8% accuracy, 65% Salesforce speedup. Hyundai — 50M+ data points/day, 10,000+ vehicles, sub-150ms inference, 95% test coverage. LLMLab — sub-45ms response, 8 merged PRs, multi-provider support.",
    metadata: { category: "numbers" },
  },
  {
    content:
      "Ariv's online profiles and portfolio links: Portfolio website: https://arivfolio.tech/ — LinkedIn: https://www.linkedin.com/in/arivunidhi-anna-arivan/ — GitHub: https://github.com/ArivunidhiA — X (Twitter): https://twitter.com/Ariv_2012 — Email: annaarivan.a@northeastern.edu — Phone: 857-398-5481 — Calendly (book a meeting): https://calendly.com/annaarivan-a-northeastern/15-min-coffee-chat",
    metadata: { category: "links", type: "profiles" },
  },
  {
    content:
      "Ariv's project links — LLMLab (LLM cost tracking platform): GitHub: https://github.com/ArivunidhiA/llmlab | Live: https://llmlab.vercel.app — Job Copilot (AI job application system): GitHub: https://github.com/ArivunidhiA/Job-Copilot — AI Infrastructure Orchestration Platform (RAG-powered): GitHub: https://github.com/ArivunidhiA/AI-Infrastructure-Orchestration-Platform---RAG | Live Demo: https://ai-infrastructure-with-rag.netlify.app/ — Retention & Upsell AI Agent: GitHub: https://github.com/ArivunidhiA/Retention-and-Upsell-AI-Agent | Live Demo: https://ai-agent-retention.netlify.app/ — Vendor Scorecard Platform: GitHub: https://github.com/ArivunidhiA/vendor-scorecard | Live: https://vendor-scorecard.onrender.com",
    metadata: { category: "links", type: "projects" },
  },
  {
    content:
      "Ariv's research publications: 1) 'Cryptocurrency Market Price Prediction using Machine Learning' (2023) — published in Seybold Report Vol 18, pages 2351-2358. Compared LSTM, Random Forest, XGBoost, ARIMA on 5 years of Bitcoin/Ethereum data. Link: https://seyboldreport.org/article_overview?id=MDIyMDIzMDMwNzMyMjUzODAx 2) 'Finding Missing Person using Artificial Intelligence' (2023) — computer vision + geospatial analysis using FaceNet embeddings. Link: https://drive.google.com/file/d/1PfNSfmv3DBBAQcGAscawKWGqXiz1OlT0/view",
    metadata: { category: "links", type: "publications" },
  },
  {
    content:
      "Ariv's customer-facing and end-to-end implementation experience: At Crossroads Community Services, Ariv didn't just write backend code. He sat with nonprofit staff who had zero technical background, understood their donation workflow pain points, and built a complete Stripe payment system end-to-end. He handled onboarding, integration, testing with real donors, and post-launch support. When webhooks were duplicating transactions, he diagnosed it in production while coordinating with the finance team. At Bright Mind, he built a volunteer coordination platform by embedding with program coordinators across 12 states, understanding how each region operated differently, and shipping a system that 1,000+ non-technical volunteers could actually use. He owned the entire lifecycle: requirements gathering, architecture, implementation, deployment, and ongoing support.",
    metadata: { category: "role_fit", role_type: "forward_deployment_engineer" },
  },
  {
    content:
      "Ariv's ability to translate customer problems into technical solutions: At Serotonin, the customer support team was drowning in 2-hour response times. Ariv didn't just build a RAG system. He spent time understanding what questions customers actually asked, how support agents triaged issues, and what 'good enough' accuracy looked like for the business. He built the system to handle 12,000+ queries/month with sub-200ms latency. At Crossroads, he optimized Salesforce queries not because someone filed a Jira ticket, but because he noticed the ops team waiting 8 seconds per query and realized it was killing their productivity. He cut it to 2.9 seconds. This is the pattern: he sees the human problem, not just the technical one.",
    metadata: { category: "role_fit", role_type: "forward_deployment_engineer" },
  },
  {
    content:
      "Ariv's post-sales and integration support experience: At every role, Ariv has owned post-deployment support. At Crossroads, after launching the Stripe payment system ($90K+ processed), he handled webhook failures, duplicate transaction bugs, and donor-facing issues in production. At Bright Mind, after deploying the volunteer platform, he maintained it across 12 states with different operational needs, responding to coordinator feedback and shipping updates. At Serotonin, he resolved 25+ recurring production incidents using DataDog distributed tracing, often working directly with the team that reported the issue to understand the real impact. He doesn't just ship and move on. He owns it.",
    metadata: { category: "role_fit", role_type: "forward_deployment_engineer" },
  },
  {
    content:
      "Ariv's system design and architecture experience (for Software Engineer roles): Built microservices OAuth architecture with unified API gateway at Serotonin (5+ integrations, 100% unauthorized access prevention). Designed async event pipeline processing 5,000+ events/day with two-stage ingestion and verification. Built telemetry microservice at Hyundai handling 50M+ data points/day using MQTT, delta encoding, gzip compression. Designed serverless data pipeline at Crossroads (AWS Lambda + S3) syncing 10,000+ records/day. Built LLMLab as a proxy layer with sub-45ms response times, async SSE streaming, and multi-provider support. Every system was production-grade with monitoring, error handling, and CI/CD.",
    metadata: { category: "role_fit", role_type: "software_engineer" },
  },
  {
    content:
      "Ariv's data and analytics experience (for Data Analyst / Data Engineer roles): At Hyundai, processed 50M+ telemetry data points daily from 10,000+ vehicles, stored in AWS S3 data lake with Parquet format. Built anomaly detection (Z-score based) and cost forecasting (linear regression) in LLMLab. Optimized Salesforce SOQL queries at Crossroads from 8.2s to 2.9s (65% improvement) by fixing N+1 patterns and switching to Bulk API 2.0. Published research comparing LSTM, Random Forest, XGBoost, and ARIMA for cryptocurrency price prediction. Comfortable with Python data stack, SQL, and building data pipelines at scale.",
    metadata: { category: "role_fit", role_type: "data_analyst" },
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
