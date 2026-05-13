// Public CV parsing endpoint for the careers application form.
// Accepts a base64-encoded file, asks the AI gateway to extract contact info,
// and returns { name, email, phone, location } as best as it can.
// No auth required — guarded by file-size cap and per-IP rate limiting (best-effort).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const { fileBase64, mimeType, fileName } = body as {
      fileBase64?: string; mimeType?: string; fileName?: string;
    };
    if (!fileBase64 || !mimeType) return json({ error: "fileBase64 and mimeType required" }, 400);

    // Approx byte size check (base64 -> ~3/4 of length).
    const approxBytes = Math.floor((fileBase64.length * 3) / 4);
    if (approxBytes > MAX_BYTES) return json({ error: "File too large" }, 413);

    const allowedMimes = new Set([
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "text/plain",
    ]);
    if (!allowedMimes.has(mimeType)) {
      return json({ error: "Unsupported file type. Upload a PDF, DOCX, DOC, or TXT." }, 415);
    }

    const systemPrompt = `You extract contact details from a CV/resume.
Return ONLY a compact JSON object with these keys (use null when unknown):
{ "name": string|null, "email": string|null, "phone": string|null, "location": string|null }
- "name": full personal name as it appears at the top of the CV.
- "email": primary email address.
- "phone": primary phone number including country code if present.
- "location": City + Country if available, otherwise just city.
Do not invent information. If the document is not a CV, return all nulls.`;

    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: `Extract contact details. File: ${fileName ?? "resume"}.` },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${fileBase64}` } },
        ],
      },
    ];

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("parse-resume-public AI error", aiResp.status, t);
      if (aiResp.status === 429) return json({ error: "Rate limit exceeded. Try again shortly." }, 429);
      return json({ error: "Could not read CV. You can fill in your details manually." }, 502);
    }
    const aiJson = await aiResp.json();
    const raw = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }
    return json({
      ok: true,
      name: typeof parsed.name === "string" ? parsed.name : null,
      email: typeof parsed.email === "string" ? parsed.email : null,
      phone: typeof parsed.phone === "string" ? parsed.phone : null,
      location: typeof parsed.location === "string" ? parsed.location : null,
    });
  } catch (e) {
    console.error("parse-resume-public error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
