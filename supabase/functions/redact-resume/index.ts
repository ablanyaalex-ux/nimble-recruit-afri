// Auto-redact a candidate's PDF CV: detects PII bounding boxes with Gemini
// vision, then burns opaque black rectangles using pdf-lib. Uploads the
// redacted PDF to the resumes bucket and stores the path on the candidate.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Box = { page: number; box: [number, number, number, number]; kind?: string };

const SYSTEM_PROMPT = [
  "You are a PII detector for resumes. Given a CV PDF, return a JSON array of bounding boxes covering every piece of personally identifying information that should be hidden from a hiring manager doing an unbiased review.",
  "",
  "Detect and box ALL of the following everywhere they appear (header, footer, body, sidebars):",
  "- Candidate's full name (every occurrence, including initials in headers/footers)",
  "- Email addresses",
  "- Phone numbers",
  "- LinkedIn URLs/handles, personal website URLs, GitHub handles, Twitter/X handles",
  "- Postal address, city, country, location, nationality, citizenship",
  "- Date of birth, age, place of birth",
  "- Marital/family status, spouse, children, dependents",
  "- Gender, sex, pronouns",
  "- Photo of the candidate (box the whole photo)",
  "- Names and contact details of references",
  "- Education institution names, degree details, and graduation years",
  "",
  "Return ONLY valid JSON in this exact shape, no prose:",
  '{"boxes":[{"page":1,"box":[ymin,xmin,ymax,xmax],"kind":"name"}, ...]}',
  "",
  "Coordinates are normalized integers from 0 to 1000 with the origin at the TOP-LEFT of each page (Gemini standard). page is 1-indexed. Pad each box by ~5 units on every side so no character peeks out. Boxes should be tight around the text/photo only — do not redact whole sections.",
].join("\n");

function extractJson(text: string): { boxes: Box[] } {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { boxes: parsed };
    if (parsed && Array.isArray(parsed.boxes)) return parsed;
  } catch (_) { /* fall through */ }
  // Try to salvage the first {...} object
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch (_) { /* ignore */ }
  }
  return { boxes: [] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const candidateId = body?.candidateId;
    if (!candidateId || typeof candidateId !== "string") {
      return new Response(JSON.stringify({ error: "candidateId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Reuse RLS to confirm the caller can edit this candidate's workspace.
    const { data: candidate, error: cErr } = await userClient
      .from("candidates")
      .select("id, full_name, resume_path, workspace_id")
      .eq("id", candidateId)
      .maybeSingle();
    if (cErr || !candidate) {
      return new Response(JSON.stringify({ error: "Candidate not found or no access" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!candidate.resume_path) {
      return new Response(JSON.stringify({ error: "No resume on file" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!/\.pdf($|\?)/i.test(candidate.resume_path)) {
      return new Response(JSON.stringify({ error: "Auto-redaction currently supports PDF resumes only." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: file, error: dErr } = await admin.storage.from("resumes").download(candidate.resume_path);
    if (dErr || !file) {
      return new Response(JSON.stringify({ error: "Failed to download resume" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const pdfBytes = new Uint8Array(await file.arrayBuffer());

    // Base64 for Gemini
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < pdfBytes.length; i += chunk) {
      binary += String.fromCharCode(...pdfBytes.subarray(i, i + chunk));
    }
    const b64 = btoa(binary);

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: `Candidate name: ${candidate.full_name}. Detect every piece of PII to redact on this CV.` },
              { type: "image_url", image_url: { url: `data:application/pdf;base64,${b64}` } },
            ],
          },
        ],
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      const status = aiResp.status === 429 || aiResp.status === 402 ? aiResp.status : 500;
      const msg = aiResp.status === 429
        ? "Rate limit exceeded. Please try again shortly."
        : aiResp.status === 402
        ? "AI credits exhausted. Add funds in Settings > Workspace > Usage."
        : "Detection failed";
      return new Response(JSON.stringify({ error: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const aiJson = await aiResp.json();
    const content: string = aiJson?.choices?.[0]?.message?.content ?? "";
    const { boxes } = extractJson(content);

    // Burn black rectangles onto the PDF.
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    let drawn = 0;
    for (const b of boxes) {
      const pageIdx = (b?.page ?? 1) - 1;
      const page = pages[pageIdx];
      if (!page || !Array.isArray(b?.box) || b.box.length !== 4) continue;
      const [yminN, xminN, ymaxN, xmaxN] = b.box.map((n) => Math.max(0, Math.min(1000, Number(n) || 0)));
      if (xmaxN <= xminN || ymaxN <= yminN) continue;
      const { width: pw, height: ph } = page.getSize();
      const x = (xminN / 1000) * pw;
      const w = ((xmaxN - xminN) / 1000) * pw;
      // Convert from top-origin (Gemini) to bottom-origin (PDF)
      const yTop = (yminN / 1000) * ph;
      const h = ((ymaxN - yminN) / 1000) * ph;
      const y = ph - yTop - h;
      // Pad slightly
      const pad = 1.5;
      page.drawRectangle({
        x: Math.max(0, x - pad),
        y: Math.max(0, y - pad),
        width: Math.min(pw, w + pad * 2),
        height: Math.min(ph, h + pad * 2),
        color: rgb(0, 0, 0),
        opacity: 1,
        borderWidth: 0,
      });
      drawn++;
    }

    const out = await pdfDoc.save();
    const outPath = `redacted/${candidate.id}.pdf`;
    const { error: upErr } = await admin.storage
      .from("resumes")
      .upload(outPath, out, { contentType: "application/pdf", upsert: true });
    if (upErr) {
      console.error("Upload error", upErr);
      return new Response(JSON.stringify({ error: "Failed to upload redacted PDF" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await admin.from("candidates").update({ redacted_resume_path: outPath }).eq("id", candidate.id);

    const { data: signed } = await admin.storage.from("resumes").createSignedUrl(outPath, 600);

    return new Response(
      JSON.stringify({ redactedPath: outPath, redactedUrl: signed?.signedUrl ?? null, regionsDrawn: drawn }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("redact-resume error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
