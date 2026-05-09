import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function initials(fullName?: string | null) {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0]?.toUpperCase() ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0]?.toUpperCase() ?? "" : "";
  return last ? `${first}. ${last}.` : first ? `${first}.` : "Candidate";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactText(text: string, candidate: { full_name?: string | null; headline?: string | null }) {
  let redacted = text;
  if (candidate.full_name?.trim()) {
    redacted = redacted.replace(new RegExp(escapeRegExp(candidate.full_name.trim()), "gi"), initials(candidate.full_name));
  }
  return redacted
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email redacted]")
    .replace(/(?:https?:\/\/|www\.)\S+/gi, "[link redacted]")
    .replace(/\b(?:linkedin\.com\/in\/|linkedin profile|linkedin)\S*[^\n]*/gi, "[LinkedIn redacted]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[phone redacted]")
    .replace(/^\s*(?:age|date of birth|dob|birth date|born)\s*[:\-].*$/gim, "[age/date of birth redacted]")
    .replace(/^\s*(?:marital status|civil status|spouse|children|family status)\s*[:\-].*$/gim, "[marital/family status redacted]")
    .replace(/^\s*(?:gender|sex|pronouns|nationality|citizenship|address|location)\s*[:\-].*$/gim, "[personal identifier redacted]")
    .replace(/\*\*\s*Education\s*\*\*[\s\S]*?(?=\n\s*\*\*|$)/gi, "**Education**\n[education details redacted]")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    // Auth client (verifies the user)
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { candidateId, jobCandidateId, force } = await req.json();
    if (!candidateId) {
      return new Response(JSON.stringify({ error: "candidateId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Fetch candidate via user-scoped client to enforce RLS
    const { data: candidate, error: cErr } = await userClient
      .from("candidates")
      .select("id, full_name, headline, resume_path, resume_summary, anonymized_resume_summary")
      .eq("id", candidateId)
      .maybeSingle();
    if (cErr || !candidate) {
      return new Response(JSON.stringify({ error: "Candidate not found or no access" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let anonymizedForCaller = false;
    if (jobCandidateId) {
      const { data: jc } = await userClient
        .from("job_candidates")
        .select("anonymized, jobs(workspace_id)")
        .eq("id", jobCandidateId)
        .eq("candidate_id", candidateId)
        .maybeSingle();
      const workspaceId = (jc as any)?.jobs?.workspace_id;
      if (jc?.anonymized && workspaceId) {
        const { data: member } = await userClient
          .from("workspace_members")
          .select("role")
          .eq("workspace_id", workspaceId)
          .eq("user_id", userData.user.id)
          .maybeSingle();
        anonymizedForCaller = member?.role === "hiring_manager";
      }
    }

    if (!force && candidate.resume_summary && candidate.anonymized_resume_summary) {
      return new Response(JSON.stringify({
        summary: anonymizedForCaller ? null : candidate.resume_summary,
        anonymizedSummary: candidate.anonymized_resume_summary,
        cached: true,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!candidate.resume_path) {
      return new Response(JSON.stringify({ error: "No resume on file" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download resume
    const { data: file, error: dErr } = await admin.storage.from("resumes").download(candidate.resume_path);
    if (dErr || !file) {
      return new Response(JSON.stringify({ error: "Failed to download resume" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const buf = new Uint8Array(await file.arrayBuffer());
    // Convert to base64
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      binary += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    const b64 = btoa(binary);

    const lower = candidate.resume_path.toLowerCase();
    let mime = "application/pdf";
    if (lower.endsWith(".docx")) mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    else if (lower.endsWith(".doc")) mime = "application/msword";
    else if (lower.endsWith(".txt")) mime = "text/plain";

    const needsRecruiterSummary = force || !candidate.resume_summary;
    const needsAnonymizedSummary = force || !candidate.anonymized_resume_summary;
    const messages = [
      {
        role: "system",
        content: needsRecruiterSummary
          ? "You are a recruiting assistant. Summarize a candidate's resume into a concise, scannable brief for a busy recruiter. Output Markdown with these sections: '**Snapshot**' (2-3 sentence overview), '**Key strengths**' (3-5 bullets), '**Experience highlights**' (3-5 bullets, each with company/role/impact), '**Skills**' (comma-separated), '**Education**' (1-2 lines). Keep it factual; do not invent information. Then add a second section headed '---ANONYMISED REVIEW CV---' containing a hiring-manager review version that redacts name, contact details, LinkedIn/URLs, address/location, age/date of birth, gender, nationality/citizenship, marital/family status, personal IDs, photos, and all education details. In the anonymised version, keep useful review evidence: roles, responsibilities, achievements, relevant tools, skills, industries, scope and impact. Use initials only if a name is needed."
          : "You are a recruiting assistant. Create only an anonymised CV brief for hiring-manager review. Output Markdown with useful review evidence: role/seniority snapshot, key strengths, experience highlights, skills, and any relevant certifications only if they do not identify education history. Redact name, contact details, LinkedIn/URLs, address/location, age/date of birth, gender, nationality/citizenship, marital/family status, personal IDs, photos, and all education details. Do not include schools, universities, graduation years, degrees, or personal identifiers. Keep it factual; do not invent information.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: `Process this resume${needsRecruiterSummary ? ` for candidate ${candidate.full_name}${candidate.headline ? ` (${candidate.headline})` : ""}` : " for anonymous hiring-manager review"}.` },
          { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
        ],
      },
    ];

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI summarization failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const content: string = aiJson?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) {
      return new Response(JSON.stringify({ error: "Empty summary" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [recruiterPart, anonymizedPart] = needsRecruiterSummary
      ? content.split(/---\s*ANONYMISED REVIEW CV\s*---/i).map((part) => part.trim())
      : [candidate.resume_summary ?? "", content];
    const summary = needsRecruiterSummary ? recruiterPart : candidate.resume_summary;
    const anonymizedSummary = redactText(anonymizedPart || content, candidate);

    await admin
      .from("candidates")
      .update({
        ...(needsRecruiterSummary ? { resume_summary: summary } : {}),
        ...(needsAnonymizedSummary ? { anonymized_resume_summary: anonymizedSummary } : {}),
        resume_summary_generated_at: new Date().toISOString(),
      })
      .eq("id", candidateId);

    return new Response(JSON.stringify({
      summary: anonymizedForCaller ? null : summary,
      anonymizedSummary,
      cached: false,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("summarize-resume error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
