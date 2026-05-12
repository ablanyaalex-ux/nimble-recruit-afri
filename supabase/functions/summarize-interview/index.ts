import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SYSTEM_PROMPT = `You are an expert Recruitment Analyst. Analyze the provided interview transcript against the Job Description. Respond with ONLY valid JSON (no markdown, no commentary) with these keys:
{
  "executive_summary": "3-sentence overview of the candidate's performance",
  "technical_alignment": { "score": 1-10, "rationale": "..." },
  "culture_fit": "observations on communication style and values",
  "red_flags": ["..."],
  "suggested_questions": ["q1","q2","q3"]
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { interviewId, transcript: providedTranscript } = await req.json();
    if (!interviewId) return json({ error: "interviewId required" }, 400);

    const { data: interview } = await admin
      .from("interview_schedules")
      .select("id, workspace_id, job_candidate_id, job_candidates(anonymized, jobs(title, description), candidates(full_name))")
      .eq("id", interviewId).maybeSingle();
    if (!interview) return json({ error: "Not found" }, 404);

    const { data: canEdit } = await admin.rpc("can_edit_workspace", {
      _uid: u.user.id, _workspace_id: interview.workspace_id,
    });
    if (!canEdit) return json({ error: "Forbidden" }, 403);

    const jc: any = interview.job_candidates;
    const candidateName = jc?.candidates?.full_name ?? "";
    const anonymized = !!jc?.anonymized;
    const jobTitle = jc?.jobs?.title ?? "";
    const jobDescription = jc?.jobs?.description ?? "";

    let transcript = providedTranscript;
    if (!transcript) {
      const { data: rec } = await admin.from("interview_recordings")
        .select("transcript").eq("interview_id", interviewId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      transcript = rec?.transcript;
    }
    if (!transcript) return json({ error: "No transcript available" }, 400);

    // Name scrubbing for anonymity
    if (anonymized && candidateName) {
      const re = new RegExp(candidateName.split(/\s+/).filter(Boolean).join("|"), "gi");
      transcript = transcript.replace(re, "[Candidate]");
    }

    const userPrompt = `JOB TITLE: ${jobTitle}\n\nJOB DESCRIPTION:\n${jobDescription}\n\nTRANSCRIPT:\n${transcript}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (aiResp.status === 429) return json({ error: "Rate limited. Try again shortly." }, 429);
    if (aiResp.status === 402) return json({ error: "AI credits exhausted." }, 402);
    if (!aiResp.ok) {
      const text = await aiResp.text();
      return json({ error: `AI error: ${text.slice(0, 300)}` }, 500);
    }
    const aiJson = await aiResp.json();
    const content = aiJson.choices?.[0]?.message?.content ?? "{}";
    let parsed: any;
    try { parsed = JSON.parse(content); } catch { parsed = { executive_summary: content }; }

    // Upsert recording with summary
    const { data: existing } = await admin.from("interview_recordings")
      .select("id").eq("interview_id", interviewId).limit(1).maybeSingle();
    if (existing) {
      await admin.from("interview_recordings").update({
        ai_summary: parsed,
        transcript,
      }).eq("id", existing.id);
    } else {
      await admin.from("interview_recordings").insert({
        interview_id: interviewId,
        transcript,
        ai_summary: parsed,
        created_by: u.user.id,
      });
    }

    return json({ ok: true, summary: parsed });
  } catch (e) {
    console.error("summarize-interview", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
