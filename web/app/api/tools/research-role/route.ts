import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function POST(req: Request) {
  if (!OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.company || !body?.role) {
    return NextResponse.json(
      { error: "Missing company or role" },
      { status: 400 }
    );
  }

  const { company, role } = body;

  // Step 1: Use GPT to research what this company does and what this role needs
  const roleResearchRes = await fetch(
    "https://api.openai.com/v1/chat/completions",
    {
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
- "company_summary": 1-2 sentences on what the company does and their core product/mission
- "role_core_needs": array of 3-5 things this role ACTUALLY needs day-to-day (not just technical skills, but the real work). Be specific. For example, a Forward Deployment Engineer needs: customer empathy, end-to-end implementation for clients, post-sales technical support, ability to translate customer problems into technical solutions, comfort working directly with non-technical stakeholders.
- "key_traits": array of 3-4 personality/work traits that matter most (e.g. "customer-facing communication", "ownership mentality", "technical depth", "startup speed")
- "pitch_order": array of what to emphasize FIRST, SECOND, THIRD when pitching a candidate. The first item should be what this role cares about MOST.
Return ONLY valid JSON, no markdown.`,
          },
          {
            role: "user",
            content: `Company: ${company}\nRole: ${role}`,
          },
        ],
        temperature: 0.2,
      }),
    }
  );

  let roleAnalysis = {
    company_summary: `${company} is a technology company.`,
    role_core_needs: ["technical skills", "problem solving"],
    key_traits: ["technical depth"],
    pitch_order: ["technical experience", "project scale", "team collaboration"],
  };

  if (roleResearchRes.ok) {
    const data = await roleResearchRes.json();
    try {
      roleAnalysis = JSON.parse(data.choices[0].message.content);
    } catch {
      // keep defaults
    }
  }

  // Step 2: Search Ariv's knowledge base for experiences matching this role's needs
  const supabase = getSupabase();
  const relevantExperiences: string[] = [];

  if (supabase) {
    // Build search queries from the role's core needs
    const searchQueries = [
      `${role} ${company} customer-facing implementation`,
      roleAnalysis.role_core_needs.slice(0, 3).join(" "),
      roleAnalysis.pitch_order[0] || role,
    ];

    for (const query of searchQueries) {
      try {
        const embRes = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "text-embedding-3-small",
            input: query,
          }),
        });

        if (!embRes.ok) continue;
        const embData = await embRes.json();
        const embedding = embData.data[0].embedding;

        const { data: matches } = await supabase.rpc("match_knowledge", {
          query_embedding: embedding,
          match_threshold: 0.15,
          match_count: 3,
        });

        if (matches) {
          for (const m of matches) {
            if (!relevantExperiences.includes(m.content)) {
              relevantExperiences.push(m.content);
            }
          }
        }
      } catch {
        // continue with other queries
      }
    }
  }

  // Step 3: Use GPT to map Ariv's experiences to this specific role
  const mappingRes = await fetch(
    "https://api.openai.com/v1/chat/completions",
    {
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
- "lead_with": The single most compelling thing to say FIRST about Ariv for this role. This should directly address what the role cares about most. 2-3 sentences max.
- "supporting_points": Array of 2-3 additional points to mention, ordered by relevance to this specific role.
- "avoid": What NOT to lead with for this role (things that are less relevant).
- "connection": A natural way to connect Ariv's experience to what this company specifically does. 1-2 sentences.
Return ONLY valid JSON, no markdown.`,
          },
          {
            role: "user",
            content: `Role Analysis:\n${JSON.stringify(roleAnalysis, null, 2)}\n\nAriv's Relevant Experiences:\n${relevantExperiences.join("\n\n")}`,
          },
        ],
        temperature: 0.3,
      }),
    }
  );

  let pitchStrategy = {
    lead_with: "Ariv has strong technical skills and real production experience.",
    supporting_points: ["Built systems at scale", "Customer-facing experience"],
    avoid: "Generic technical skills listing",
    connection: `Ariv's experience aligns well with what ${company} does.`,
  };

  if (mappingRes.ok) {
    const data = await mappingRes.json();
    try {
      pitchStrategy = JSON.parse(data.choices[0].message.content);
    } catch {
      // keep defaults
    }
  }

  return NextResponse.json({
    company: company,
    role: role,
    company_summary: roleAnalysis.company_summary,
    role_core_needs: roleAnalysis.role_core_needs,
    key_traits: roleAnalysis.key_traits,
    pitch_order: roleAnalysis.pitch_order,
    lead_with: pitchStrategy.lead_with,
    supporting_points: pitchStrategy.supporting_points,
    avoid: pitchStrategy.avoid,
    connection: pitchStrategy.connection,
    relevant_experiences: relevantExperiences.slice(0, 5),
  });
}
