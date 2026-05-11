// Detects PII bounding boxes on a candidate's CV PDF using a vision LLM.
// Returns per-page normalized boxes (0-1 of page width/height, origin top-left).
// The recruiter can adjust them client-side before burning them into a PDF.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Box = { x: number; y: number; w: number; h: number; kind: string; page: number };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY missing" }, 500);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const { candidateId } = await req.json();
    if (!candidateId) return json({ error: "candidateId required" }, 400);

    const { data: candidate, error: cErr } = await userClient
      .from("candidates")
      .select("id, full_name, email, phone, linkedin_url, location, resume_path")
      .eq("id", candidateId)
      .maybeSingle();
    if (cErr || !candidate) return json({ error: "Candidate not found or no access" }, 404);
    if (!candidate.resume_path) return json({ error: "No resume on file" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: file, error: dErr } = await admin.storage.from("resumes").download(candidate.resume_path);
    if (dErr || !file) return json({ error: "Failed to download resume" }, 500);

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

    const known = [
      candidate.full_name && `Full name: ${candidate.full_name}`,
      candidate.email && `Email: ${candidate.email}`,
      candidate.phone && `Phone: ${candidate.phone}`,
      candidate.linkedin_url && `LinkedIn: ${candidate.linkedin_url}`,
      candidate.location && `Location: ${candidate.location}`,
    ].filter(Boolean).join("\n");

    const systemPrompt = [
      "You are a CV redaction assistant. Look at every page of the attached CV and return tight bounding boxes around any text or visual element that reveals candidate identity or protected attributes.",
      "Detect: full name, email, phone, postal address, city / country / location, LinkedIn URL, personal website, photograph or headshot, date of birth or age, marital/family status, gender, nationality, religion, ethnicity, government IDs, profile picture.",
      "Do NOT box: job titles, company names, employment dates, education institutions/degrees, skills, certifications, project descriptions, achievements.",
      "",
      "Output ONLY valid JSON of shape:",
      '{"pages":[{"page":1,"width":1,"height":1,"boxes":[{"x":0.12,"y":0.05,"w":0.30,"h":0.04,"kind":"name"}]}]}',
      "",
      "Rules:",
      "- One entry per page in the CV (page numbers start at 1).",
      "- All coordinates are normalized 0..1 of the page (x,y is the top-left corner of the box; origin top-left).",
      "- Pad each box by ~1% on every side so the redaction fully covers the text.",
      "- `kind` is one of: name, email, phone, address, location, linkedin, url, photo, age, dob, marital, gender, nationality, id, other.",
      "- If a page has no PII, return an empty `boxes` array for it.",
      "- Return JSON only — no markdown, no commentary.",
    ].join("\n");

    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: `Known candidate identifiers (use to anchor detection, but also find anything else that fits the categories):\n${known || "(none provided)"}` },
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
      if (aiResp.status === 429) return json({ error: "Rate limit exceeded. Please try again shortly." }, 429);
      if (aiResp.status === 402) return json({ error: "AI credits exhausted. Add funds in Settings > Workspace > Usage." }, 402);
      return json({ error: "Auto-detection failed" }, 500);
    }

    const aiJson = await aiResp.json();
    const content: string = aiJson?.choices?.[0]?.message?.content ?? "";
    let parsed: any = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch { /* ignore */ }
      }
    }

    const pages = Array.isArray(parsed?.pages) ? parsed.pages : [];
    const boxes: Box[] = [];
    for (const p of pages) {
      const pageNum = Number(p?.page);
      if (!pageNum || pageNum < 1) continue;
      const pageBoxes = Array.isArray(p?.boxes) ? p.boxes : [];
      for (const b of pageBoxes) {
        const x = clamp01(Number(b?.x));
        const y = clamp01(Number(b?.y));
        const w = clamp01(Number(b?.w));
        const h = clamp01(Number(b?.h));
        if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(w) || Number.isNaN(h)) continue;
        if (w <= 0 || h <= 0) continue;
        boxes.push({
          page: pageNum,
          x, y, w, h,
          kind: typeof b?.kind === "string" ? b.kind : "other",
        });
      }
    }

    return json({ boxes });
  } catch (e) {
    console.error("redact-resume-detect error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function clamp01(n: number) {
  if (Number.isNaN(n)) return n;
  return Math.max(0, Math.min(1, n));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
