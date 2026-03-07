import { createLogger } from "./logger";
import { hybridSearch, rerank } from "./hybrid-rag";
import { recallMemories } from "./semantic-memory";
import { getSupabase } from "./supabase";

const log = createLogger({ tool: "executor" });
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CALENDLY_API_KEY = process.env.CALENDLY_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const EVENT_TYPE_URI =
  "https://api.calendly.com/event_types/8ad36e18-41a3-4b69-a3dd-7b86afe88a5d";
const SCHEDULING_URL =
  "https://calendly.com/annaarivan-a-northeastern/15-min-coffee-chat";

/**
 * Centralized tool executor used by both the sideband (server-side)
 * and the client fallback. Returns the tool result as a string.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  sessionId?: string,
): Promise<{ result: string; uiMessage?: { id: string; text: string } }> {
  const slog = log.child({ sessionId, tool: name });

  switch (name) {
    case "check_availability":
      return slog.time("check_availability", () => execAvailability(args));

    case "schedule_meeting":
      return slog.time("schedule_meeting", () => execSchedule(args));

    case "send_confirmation_email":
      return slog.time("send_confirmation_email", () => execEmail(args));

    case "retrieve_knowledge":
      return slog.time("retrieve_knowledge", () => execRag(args, sessionId));

    case "lookup_caller":
      return slog.time("lookup_caller", () => execCallerMemory(args));

    case "research_role":
      return slog.time("research_role", () => execResearchRole(args));

    case "generate_summary":
      return execSummary(args);

    default:
      return { result: `Unknown function: ${name}` };
  }
}

async function execAvailability(
  args: Record<string, unknown>,
): Promise<{ result: string }> {
  if (!CALENDLY_API_KEY) {
    return {
      result: `Calendly not configured. Direct booking link: ${SCHEDULING_URL}`,
    };
  }

  const now = new Date();
  let start: Date;
  if (args.start_date) {
    const parsed = new Date(args.start_date + "T00:00:00Z");
    start = parsed > now ? parsed : new Date(now.getTime() + 60_000);
  } else {
    start = new Date(now.getTime() + 60_000);
  }
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

  const url = new URL("https://api.calendly.com/event_type_available_times");
  url.searchParams.set("event_type", EVENT_TYPE_URI);
  url.searchParams.set("start_time", start.toISOString());
  url.searchParams.set("end_time", end.toISOString());

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${CALENDLY_API_KEY}` },
  });

  if (!res.ok) {
    return {
      result: `Could not fetch live availability. Direct booking link: ${SCHEDULING_URL}`,
    };
  }

  const data = await res.json();
  const slots = (data.collection || [])
    .filter((s: { status: string; start_time: string }) => {
      if (s.status !== "available") return false;
      const hour = new Date(s.start_time).getUTCHours();
      return hour >= 15 && hour < 22;
    })
    .slice(0, 10)
    .map((s: { start_time: string }) => s.start_time);

  if (slots.length === 0) {
    return {
      result: `No slots found in the next 7 days between 10am-5pm EST. Share the booking link: ${SCHEDULING_URL}`,
    };
  }

  const slotsByDay: Record<string, string[]> = {};
  for (const s of slots) {
    const day = new Date(s).toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      timeZone: "America/New_York",
    });
    if (!slotsByDay[day]) slotsByDay[day] = [];
    slotsByDay[day].push(
      new Date(s).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
      }),
    );
  }

  const formatted = slots
    .map((s: string) =>
      new Date(s).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }),
    )
    .join(", ");

  const dayList = Object.keys(slotsByDay).join(", ");
  return {
    result: `Available slots across ${dayList}: ${formatted}. IMPORTANT: Mention ALL available days. Booking link: ${SCHEDULING_URL}`,
  };
}

async function execSchedule(
  args: Record<string, unknown>,
): Promise<{ result: string; uiMessage?: { id: string; text: string } }> {
  const { start_time, name, email, notes } = args as {
    start_time: string;
    name: string;
    email: string;
    notes?: string;
  };

  if (!start_time || !name || !email) {
    return { result: "Missing required booking info (time, name, email)." };
  }

  const date = new Date(start_time);
  const dateStr = date.toISOString().split("T")[0];
  const params = new URLSearchParams();
  params.set("name", name);
  params.set("email", email);
  if (notes) params.set("a1", notes);
  const bookingLink = `${SCHEDULING_URL}/${dateStr}?${params.toString()}`;

  const suggestedTime = date.toLocaleString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  });

  return {
    result: `Booking link has been displayed in the chat. Do NOT read the URL. Say: "I've dropped a booking link in the chat for you. Everything's pre-filled, just click it and you're all set."`,
    uiMessage: {
      id: `booking-${Date.now()}`,
      text: `📅 Book your meeting\n\nSuggested time: ${suggestedTime}\n\n${bookingLink}`,
    },
  };
}

async function execEmail(
  args: Record<string, unknown>,
): Promise<{ result: string }> {
  if (!RESEND_API_KEY) {
    return { result: "Email service not configured." };
  }

  const { Resend } = await import("resend");
  const resend = new Resend(RESEND_API_KEY);

  try {
    await resend.emails.send({
      from: "Ariv's AI <onboarding@resend.dev>",
      to: args.to as string,
      subject: args.subject as string,
      html: `<div style="font-family: sans-serif; line-height: 1.6;">${String(args.body || "").replace(/\n/g, "<br>")}</div>`,
    });
    return { result: "Email sent successfully." };
  } catch (err) {
    return {
      result: `Failed to send email: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }
}

async function execRag(
  args: Record<string, unknown>,
  sessionId?: string,
): Promise<{ result: string }> {
  const query = args.query as string;
  if (!query) return { result: "No query provided." };

  const results = await hybridSearch(query, 6, sessionId);
  if (results.length === 0) {
    return {
      result:
        "No specific information found. Answer based on what you know about Ariv, or suggest they ask Ariv directly.",
    };
  }

  const reranked = await rerank(query, results, 3);
  return {
    result: reranked
      .map((r) => `[Relevance: ${(r.score * 100).toFixed(0)}%] ${r.content}`)
      .join("\n\n"),
  };
}

async function execCallerMemory(
  args: Record<string, unknown>,
): Promise<{ result: string }> {
  const supabase = getSupabase();
  if (!supabase) return { result: "Database not configured." };

  const email = args.email as string;
  if (!email) return { result: "No email provided." };

  const { data: caller } = await supabase
    .from("callers")
    .select("*")
    .eq("email", email)
    .single();

  if (!caller) return { result: "First-time caller — no previous history found." };

  const memories = await recallMemories(
    email,
    "previous conversations and interests",
    3,
  );

  let memory = `Returning caller! ${caller.name || "Unknown name"} (${caller.email}).`;
  if (caller.company) memory += ` Works at ${caller.company}.`;
  if (caller.role) memory += ` Interested in: ${caller.role}.`;
  memory += ` This is call #${caller.call_count}.`;
  if (caller.last_topics?.length) {
    memory += ` Last time they asked about: ${caller.last_topics.join(", ")}.`;
  }
  if (memories.length > 0) {
    memory += `\n\nSemantic recall from past calls:`;
    for (const m of memories) {
      memory += `\n- ${m.summary} (topics: ${m.topics.join(", ")}, mood: ${m.sentiment})`;
    }
  }
  return { result: memory };
}

async function execResearchRole(
  args: Record<string, unknown>,
): Promise<{ result: string }> {
  if (!OPENAI_API_KEY) return { result: "OpenAI not configured." };

  const { company, role } = args as { company: string; role: string };
  if (!company || !role) return { result: "Missing company or role." };

  // Step 1: Analyze role requirements
  const roleRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a hiring expert. Given a company and role, provide a concise analysis. Return JSON with:
- "company_summary": 1-2 sentences about the company
- "role_core_needs": array of 3-5 day-to-day needs for this role
- "key_traits": array of 3-4 key traits
- "pitch_order": array of what to emphasize first, second, third
Return ONLY valid JSON, no markdown.`,
        },
        { role: "user", content: `Company: ${company}\nRole: ${role}` },
      ],
      temperature: 0.2,
    }),
  });

  let roleAnalysis = {
    company_summary: `${company} is a technology company.`,
    role_core_needs: ["technical skills", "problem solving"],
    key_traits: ["technical depth"],
    pitch_order: ["technical experience", "project scale", "team collaboration"],
  };

  if (roleRes.ok) {
    const data = await roleRes.json();
    try {
      roleAnalysis = JSON.parse(data.choices[0].message.content);
    } catch {
      /* keep defaults */
    }
  }

  // Step 2: RAG for relevant experiences
  const relevantExperiences: string[] = [];
  const searchQueries = [
    `${role} ${company} customer-facing implementation`,
    roleAnalysis.role_core_needs.slice(0, 3).join(" "),
    roleAnalysis.pitch_order[0] || role,
  ];

  for (const q of searchQueries) {
    const results = await hybridSearch(q, 3);
    for (const r of results) {
      if (!relevantExperiences.includes(r.content)) {
        relevantExperiences.push(r.content);
      }
    }
  }

  // Step 3: Generate pitch strategy
  const mappingRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are helping pitch a candidate named Ariv for a specific role. Given the role analysis and Ariv's experiences, create a tailored pitch strategy. Return JSON with:
- "lead_with": The single most compelling thing to say FIRST (2-3 sentences)
- "supporting_points": Array of 2-3 additional points
- "avoid": What NOT to lead with
- "connection": How to connect Ariv's experience to this company (1-2 sentences)
Return ONLY valid JSON, no markdown.`,
        },
        {
          role: "user",
          content: `Role Analysis:\n${JSON.stringify(roleAnalysis, null, 2)}\n\nAriv's Relevant Experiences:\n${relevantExperiences.join("\n\n")}`,
        },
      ],
      temperature: 0.3,
    }),
  });

  let pitchStrategy = {
    lead_with:
      "Ariv has strong technical skills and real production experience.",
    supporting_points: [
      "Built systems at scale",
      "Customer-facing experience",
    ],
    avoid: "Generic technical skills listing",
    connection: `Ariv's experience aligns well with what ${company} does.`,
  };

  if (mappingRes.ok) {
    const data = await mappingRes.json();
    try {
      pitchStrategy = JSON.parse(data.choices[0].message.content);
    } catch {
      /* keep defaults */
    }
  }

  let result = `ROLE RESEARCH RESULTS for ${role} at ${company}:\n`;
  result += `\nCompany: ${roleAnalysis.company_summary}`;
  result += `\nWhat this role ACTUALLY needs: ${roleAnalysis.role_core_needs.join(", ")}`;
  result += `\nKey traits: ${roleAnalysis.key_traits.join(", ")}`;
  result += `\nPitch order: ${roleAnalysis.pitch_order.join(" → ")}`;
  result += `\n\nLEAD WITH THIS: ${pitchStrategy.lead_with}`;
  result += `\n\nSUPPORTING POINTS:\n${pitchStrategy.supporting_points.map((p: string, i: number) => `${i + 1}. ${p}`).join("\n")}`;
  result += `\n\nCONNECTION TO COMPANY: ${pitchStrategy.connection}`;
  result += `\n\nAVOID leading with: ${pitchStrategy.avoid}`;
  if (relevantExperiences.length > 0) {
    result += `\n\nRELEVANT EXPERIENCE DETAILS:\n${relevantExperiences.slice(0, 5).join("\n\n")}`;
  }

  return { result };
}

function execSummary(
  args: Record<string, unknown>,
): { result: string; uiMessage?: { id: string; text: string } } {
  const company = (args.company as string) || "Unknown";
  const role = (args.role as string) || "General Inquiry";
  const status = (args.status as string) || "Exploring";
  const meeting = (args.meeting as string) || "Not Scheduled";

  return {
    result: `Summary has been displayed to the caller on screen. Do NOT read it out loud. Just say something brief like "There you go!" or "Hope that was helpful!" and wait.`,
    uiMessage: {
      id: `summary-${Date.now()}`,
      text: `📋 Recap\n\nCompany: ${company}\nRole: ${role}\nStatus: ${status}\nMeeting: ${meeting}`,
    },
  };
}
