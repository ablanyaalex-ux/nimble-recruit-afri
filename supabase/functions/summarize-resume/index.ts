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

function redactText(text: string, candidate: { full_name?: string | null }) {
  let redacted = text;
  if (candidate.full_name?.trim()) {
    redacted = redacted.replace(
      new RegExp(escapeRegExp(candidate.full_name.trim()), "gi"),
      initials(candidate.full_name),
    );
  }
  return redacted
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email redacted]")
    .replace(/(?:https?:\/\/|www\.)\S+/gi, "[link redacted]")
    .replace(/\b(?:linkedin\.com\/in\/|linkedin profile|linkedin)\S*[^\n]*/gi, "[LinkedIn redacted]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[phone redacted]")
    .replace(/^\s*(?:age|date of birth|dob|birth date|born)\s*[:\-].*$/gim, "[age/date of birth redacted]")
    .replace(/^\s*(?:marital status|civil status|spouse|children|family status)\s*[:\-].*$/gim, "[marital/family status redacted]")
    .replace(/^\s*(?:gender|sex|pronouns|nationality|citizenship|address|location)\s*[:\-].*$/gim, "[personal identifier redacted]")
    .trim();
}

const SECTION_DIVIDER = /---\s*FULL CV TEXT\s*---/i;

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

    const { data: candidate, error: cErr } = await userClient
      .from("candidates")
      .select("id, full_name, headline, resume_path, resume_summary, resume_full_text, anonymized_resume_summary")
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

    if (!force && candidate.resume_summary && candidate.resume_full_text) {
      return new Response(JSON.stringify({
        summary: anonymizedForCaller ? redactText(candidate.resume_summary, candidate) : candidate.resume_summary,
        resumeFullText: anonymizedForCaller ? null : candidate.resume_full_text,
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

    const { data: file, error: dErr } = await admin.storage.from("resumes").download(candidate.resume_path);
    if (dErr || !file) {
      return new Response(JSON.stringify({ error: "Failed to download resume" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const buf = new Uint8Array(await file.arrayBuffer());
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

    const systemPrompt = [
      "You are an elite recruiting analyst. Read the attached CV/resume and produce TWO sections, separated by a single line containing exactly: ---FULL CV TEXT---",
      "",
      "SECTION 1 — EXECUTIVE BRIEF (this is what a busy recruiter reads first):",
      "Write 2–3 short, punchy paragraphs (no bullet lists, no markdown headings) that give a sharp point of view on this candidate. Cover: who they are and the shape of their career, the most impressive achievements with concrete impact (numbers, scale, outcomes), what they are clearly strong at, and any caveats or things worth probing in an interview. Be opinionated and substantive — do NOT just restate the CV. Aim for ~120–200 words total.",
      "",
      "SECTION 2 — FULL CV TEXT:",
      "After the divider, output a clean, faithful Markdown rendering of the full CV. Preserve all sections (contact info, summary, experience, education, skills, certifications, languages, projects, etc.) using markdown headings (## Section) and bullet lists. Include every role with company, title, dates, location and responsibilities/achievements verbatim or near-verbatim. Include education with institution, degree and dates. Do NOT redact anything in this section — the recruiter will redact it manually. Do not invent any information.",
    ].join("\n");

    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: `Process this resume for ${candidate.full_name}${candidate.headline ? ` (${candidate.headline})` : ""}.` },
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
      body: JSON.stringify({ model: "google/gemini-2.5-pro", messages }),
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

    const [briefRaw, fullCvRaw] = content.split(SECTION_DIVIDER).map((s) => s.trim());
    const summary = briefRaw || content;
    const resumeFullText = fullCvRaw || null;

    // Auto-redact the FULL CV (not the summary) so HMs have something usable
    // until the recruiter customises the redaction.
    const autoRedactedCv = resumeFullText ? redactText(resumeFullText, candidate) : null;

    await admin
      .from("candidates")
      .update({
        resume_summary: summary,
        resume_full_text: resumeFullText,
        // Only seed the redacted CV if the recruiter hasn't customised one yet.
        ...(candidate.anonymized_resume_summary && !force ? {} : { anonymized_resume_summary: autoRedactedCv }),
        resume_summary_generated_at: new Date().toISOString(),
      })
      .eq("id", candidateId);

    return new Response(JSON.stringify({
      summary: anonymizedForCaller ? redactText(summary, candidate) : summary,
      resumeFullText: anonymizedForCaller ? null : resumeFullText,
      anonymizedSummary: (candidate.anonymized_resume_summary && !force) ? candidate.anonymized_resume_summary : autoRedactedCv,
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
