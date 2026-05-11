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

    const { candidateId, force } = await req.json();
    if (!candidateId) {
      return new Response(JSON.stringify({ error: "candidateId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: candidate, error: cErr } = await userClient
      .from("candidates")
      .select("id, full_name, headline, resume_path, resume_summary")
      .eq("id", candidateId)
      .maybeSingle();
    if (cErr || !candidate) {
      return new Response(JSON.stringify({ error: "Candidate not found or no access" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nameTokens = (candidate.full_name || "")
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2);
    const cachedHasName = candidate.resume_summary
      ? nameTokens.some((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(candidate.resume_summary!))
      : false;

    if (!force && candidate.resume_summary && !cachedHasName) {
      return new Response(JSON.stringify({ summary: candidate.resume_summary, cached: true }), {
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

    const systemPrompt = "You are an elite recruiting analyst. Read the attached CV/resume and write 2–3 short, punchy paragraphs (no bullet lists, no markdown headings) giving a sharp point of view on this candidate. Cover: who they are and the shape of their career, the most impressive achievements with concrete impact (numbers, scale, outcomes), what they are clearly strong at, and any caveats or things worth probing in an interview. Be opinionated and substantive — do NOT just restate the CV. Aim for ~120–200 words total. Do not invent anything. CRITICAL: Never mention the candidate's name or initials. Refer to them only as 'the candidate', 'they', or by role (e.g. 'this engineer'). Do not include email, phone, address, LinkedIn, or any other contact details.";

    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: `Summarise this CV. Do not use the candidate's name anywhere in your response.${candidate.headline ? ` Headline: ${candidate.headline}.` : ""}` },
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

    let summary: string = aiJson?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!summary) {
      return new Response(JSON.stringify({ error: "Empty summary" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Safety net: scrub any name tokens that slipped through.
    for (const t of nameTokens) {
      const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
      summary = summary.replace(re, "the candidate");
    }
    summary = summary.replace(/\b(the candidate)(\s+the candidate)+\b/gi, "the candidate");

    await admin
      .from("candidates")
      .update({
        resume_summary: summary,
        resume_summary_generated_at: new Date().toISOString(),
      })
      .eq("id", candidateId);

    return new Response(JSON.stringify({ summary, cached: false }), {
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
