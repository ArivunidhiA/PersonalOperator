<div align="center">

# 🤖 Ariv's AI — Personal Voice Agent

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://typescriptlang.org)
[![Deployed on Vercel](https://img.shields.io/badge/Vercel-Live-000?logo=vercel)](https://arivsai.app)
[![License](https://img.shields.io/badge/License-MIT-green)](#license)

**A real-time AI voice agent that speaks on behalf of Ariv to recruiters and visitors.**
Powered by OpenAI's Realtime API over WebRTC with tool calling, RAG, and Calendly integration.

[Live Demo](https://arivsai.app) · [Report Bug](https://github.com/ArivunidhiA/PersonalOperator/issues)

</div>

## 📑 Table of Contents

[Overview](#-overview) · [Features](#-features) · [Architecture](#-architecture) · [Tech Stack](#-tech-stack) · [Quick Start](#-quick-start) · [Configuration](#-configuration) · [API Endpoints](#-api-endpoints) · [Deployment](#-deployment) · [Development](#-development) · [Troubleshooting](#-troubleshooting)

## 🔍 Overview

Ariv's AI is a voice-first personal agent deployed at [arivsai.app](https://arivsai.app). Recruiters call in, and the AI answers questions about Ariv's experience, researches role fit in real-time, shares clickable links, schedules meetings via Calendly, and sends confirmation emails — all through natural conversation.

**Key Highlights:**
- 🎙️ Real-time voice via OpenAI's WebRTC Realtime API (sub-second latency)
- 🧠 RAG-powered knowledge retrieval from Supabase vector store
- 📅 Calendly integration with pre-filled booking links
- 📧 Automated confirmation emails via Resend
- 🔒 Clerk authentication with rate limiting via Upstash Redis
- 💬 Live transcript with clickable hyperlinks and post-call recaps

## ✨ Features

| Category | Features |
|----------|----------|
| **Voice** | WebRTC streaming, voice activity detection, connection quality monitoring, auto-reconnect |
| **Intelligence** | Role-specific research, RAG knowledge retrieval, caller memory, dynamic system prompt |
| **Scheduling** | Calendly availability check, pre-filled booking links (name/email/date), multi-day slot presentation |
| **Communication** | Resend email confirmations, clickable links in transcript, post-call summary injection |
| **UX** | Animated orb visualization, real-time transcript, system activity feed, mobile responsive |

## 🏗 Architecture

```
┌─────────────┐    WebRTC     ┌──────────────────┐
│   Browser    │◄────────────►│  OpenAI Realtime  │
│  (React UI)  │   Audio +    │    API (GPT-4o)   │
│              │  DataChannel  │                   │
└──────┬───────┘              └────────┬──────────┘
       │ REST                    Tool Calls │
       ▼                                   ▼
┌──────────────────────────────────────────────────┐
│              Next.js API Routes                  │
├──────────┬───────────┬──────────┬────────────────┤
│ /token   │ /rag      │/schedule │ /research-role │
│ /avail   │ /send-email│/post-call│ /caller-memory│
└────┬─────┴─────┬─────┴────┬─────┴───────┬───────┘
     │           │          │             │
  Clerk      Supabase   Calendly      OpenAI
  + Redis    (vectors)    API        (GPT-4o)
             + Resend
```

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Next.js 16 (App Router), TailwindCSS 4, Radix UI, OGL (WebGL orb) |
| **Backend** | Next.js API Routes, OpenAI Realtime API (WebRTC), OpenAI GPT-4o |
| **Database** | Supabase (pgvector for RAG embeddings) |
| **Auth** | Clerk (session management + middleware) |
| **Rate Limiting** | Upstash Redis |
| **Email** | Resend (transactional emails from `ai@arivsai.app`) |
| **Scheduling** | Calendly API (availability + pre-filled booking links) |
| **Deployment** | Vercel (auto-deploy from `main`) |
| **Testing** | Vitest, Testing Library, Playwright |

## 🚀 Quick Start

**Prerequisites:** Node.js 18+, npm, accounts for OpenAI, Supabase, Clerk, Calendly, Resend, Upstash

```bash
# Clone
git clone https://github.com/ArivunidhiA/PersonalOperator.git
cd PersonalOperator/web

# Install
npm install

# Configure (see Configuration section)
cp .env.example .env

# Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — click the orb to start a voice session.

## ⚙️ Configuration

Create a `.env` file in `/web` with the following:

```env
# Auth (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# AI
OPENAI_API_KEY=sk-proj-...

# Database (Supabase)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...

# Rate Limiting (Upstash)
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AZ...

# Scheduling (Calendly)
CALENDLY_API_KEY=eyJ...

# Email (Resend — requires verified domain)
RESEND_API_KEY=re_...
```

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/realtime/token` | Generate ephemeral OpenAI Realtime session token |
| `POST` | `/api/tools/rag` | RAG knowledge retrieval from Supabase vectors |
| `POST` | `/api/tools/research-role` | GPT-4o role-fit analysis for a specific company/role |
| `POST` | `/api/tools/availability` | Fetch Calendly availability (10am–5pm EST, 7-day window) |
| `POST` | `/api/tools/schedule` | Generate pre-filled Calendly booking link |
| `POST` | `/api/tools/send-email` | Send confirmation email via Resend |
| `POST` | `/api/tools/caller-memory` | Lookup/store caller context by email |
| `POST` | `/api/tools/post-call` | Save conversation transcript + summary to Supabase |
| `POST` | `/api/conversations` | Persist/retrieve conversation history |

## 🌐 Deployment

Deployed on **Vercel** with auto-deploy from `main`. Domain: [`arivsai.app`](https://arivsai.app)

```bash
# Build check
npm run build

# Push to deploy
git push origin main  # Vercel auto-deploys
```

**Required Vercel env vars:** All variables from the Configuration section must be added in Vercel → Settings → Environment Variables.

## 💻 Development

```bash
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npm run typecheck    # TypeScript check
npm run test         # Run Vitest
npm run test:watch   # Watch mode
```

**Project Structure:**
```
web/
├── app/
│   ├── components/    # RealtimeVoice (main), UI components
│   ├── api/           # 9 API routes (tools, auth, conversations)
│   └── page.tsx       # Landing page
├── lib/
│   ├── system-prompt.ts   # AI persona + rules
│   └── supabase.ts        # DB client
├── components/ui/     # Radix/shadcn primitives
└── public/            # Static assets
```

## 🔧 Troubleshooting

| Issue | Fix |
|-------|-----|
| No audio / WebRTC fails | Check browser mic permissions, ensure HTTPS in production |
| Calendly returns no slots | Verify `CALENDLY_API_KEY` is valid, check event type URI |
| Emails fail to send | Verify domain in [Resend dashboard](https://resend.com/domains), check DNS records |
| Clerk auth errors on build | Ensure `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set in Vercel env vars |
| Rate limited | Upstash Redis limits — check quota at [console.upstash.com](https://console.upstash.com) |
| Links not clickable | URLs must include `https://` prefix to be auto-linkified in transcript |

## 📄 License

MIT © [Arivunidhi Anna Arivan](https://arivfolio.tech)
