import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { jobCandidateId, force } = await req.json();
    if (!jobCandidateId) {
      return new Response(JSON.stringify({ error: "jobCandidateId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: jc, error: jcErr } = await userClient
      .from("job_candidates")
      .select("id, candidate_id, job_id, match_score, match_verdict, match_rationale, match_breakdown, jobs(title, description, location, employment_type), candidates(full_name, headline, resume_path)")
      .eq("id", jobCandidateId)
      .maybeSingle();
    if (jcErr || !jc) {
      return new Response(JSON.stringify({ error: "Not found or no access" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!force && jc.match_score != null && jc.match_verdict) {
      return new Response(JSON.stringify({
        score: jc.match_score, verdict: jc.match_verdict, rationale: jc.match_rationale, cached: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const job = jc.jobs as any;
    const cand = jc.candidates as any;
    if (!cand?.resume_path) {
      return new Response(JSON.stringify({ error: "No resume on file for this candidate" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!job?.description) {
      return new Response(JSON.stringify({ error: "Job has no description to match against" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: file, error: dErr } = await admin.storage.from("resumes").download(cand.resume_path);
    if (dErr || !file) {
      return new Response(JSON.stringify({ error: "Failed to download resume" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const buf = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) binary += String.fromCharCode(...buf.subarray(i, i + chunk));
    const b64 = btoa(binary);

    const lower = cand.resume_path.toLowerCase();
    let mime = "application/pdf";
    if (lower.endsWith(".docx")) mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    else if (lower.endsWith(".doc")) mime = "application/msword";
    else if (lower.endsWith(".txt")) mime = "text/plain";

    const jobBlock = [
      `Title: ${job.title ?? ""}`,
      job.location ? `Location: ${job.location}` : "",
      job.employment_type ? `Employment type: ${job.employment_type}` : "",
      "",
      "Job description / requirements:",
      job.description ?? "",
    ].filter(Boolean).join("\n");

    const systemPrompt = `You are an elite recruiting analyst. You must score how well a candidate matches a specific job and return STRICT JSON only — no prose, no markdown, no code fences.

Schema:
{
  "score": integer 0-100,
  "verdict": "good" | "cautious" | "bad",
  "rationale": string (3-5 sentences, opinionated, mentions specific evidence from the CV vs. the job requirements; covers strengths, gaps, and what to probe in interview)
}

Scoring guide:
- 80-100 = "good": clearly meets/exceeds the core requirements with relevant experience and impact.
- 50-79 = "cautious": partial fit; meaningful gaps, transferable but unproven, or seniority/domain mismatch.
- 0-49  = "bad": fundamental mismatch on must-haves.

Be honest and evidence-based. Do not invent qualifications. Never include the candidate's name in the rationale — refer to them as "the candidate" or "they". Output JSON only.`;

    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: `Score this candidate against the job below. Return JSON only.\n\n=== JOB ===\n${jobBlock}\n\n=== CANDIDATE CV (attached) ===${cand.headline ? `\nHeadline: ${cand.headline}` : ""}` },
          { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
        ],
      },
    ];

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages,
        response_format: { type: "json_object" },
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
      return new Response(JSON.stringify({ error: "AI matching failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    let raw: string = aiJson?.choices?.[0]?.message?.content?.trim() ?? "";
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

    let parsed: { score?: number; verdict?: string; rationale?: string } = {};
    try { parsed = JSON.parse(raw); } catch {
      console.error("Failed to parse AI JSON", raw);
      return new Response(JSON.stringify({ error: "AI returned invalid JSON" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let score = Math.round(Number(parsed.score));
    if (!Number.isFinite(score)) score = 0;
    score = Math.max(0, Math.min(100, score));

    let verdict = String(parsed.verdict ?? "").toLowerCase();
    if (!["good", "cautious", "bad"].includes(verdict)) {
      verdict = score >= 80 ? "good" : score >= 50 ? "cautious" : "bad";
    }
    const rationale = (parsed.rationale ?? "").toString().trim() || "No rationale provided.";

    await admin
      .from("job_candidates")
      .update({
        match_score: score,
        match_verdict: verdict,
        match_rationale: rationale,
        match_generated_at: new Date().toISOString(),
      })
      .eq("id", jobCandidateId);

    return new Response(JSON.stringify({ score, verdict, rationale, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("match-candidate error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
