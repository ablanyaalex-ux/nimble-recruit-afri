import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function render(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

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

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { jobCandidateId, stageKey } = await req.json();
    if (!jobCandidateId || !stageKey) {
      return new Response(JSON.stringify({ error: "jobCandidateId and stageKey required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Load job_candidate -> job -> workspace, candidate info
    const { data: jc, error: jcErr } = await admin
      .from("job_candidates")
      .select("id, stage, job_id, candidate_id, jobs(workspace_id, title), candidates(full_name, email)")
      .eq("id", jobCandidateId)
      .maybeSingle();
    if (jcErr || !jc) {
      return new Response(JSON.stringify({ error: "Candidate not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const job: any = jc.jobs;
    const candidate: any = jc.candidates;
    const workspaceId = job?.workspace_id;

    // Permission check: user must be workspace member with edit rights
    const { data: canEdit } = await admin.rpc("can_edit_workspace", {
      _uid: userData.user.id, _workspace_id: workspaceId,
    });
    if (!canEdit) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve stage
    const { data: stage } = await admin
      .from("workspace_pipeline_stages")
      .select("id, label, key")
      .eq("workspace_id", workspaceId)
      .eq("key", stageKey)
      .maybeSingle();
    if (!stage) {
      return new Response(JSON.stringify({ executed: [], skipped: ["stage not found"] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: triggers } = await admin
      .from("stage_triggers")
      .select("id, trigger_type, settings, enabled, template_id, delay_minutes")
      .eq("stage_id", stage.id)
      .eq("enabled", true);

    const executed: any[] = [];
    const skipped: any[] = [];
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("INVITE_EMAIL_FROM") ?? "Nimble Recruit <onboarding@resend.dev>";

    const vars = {
      candidate_name: candidate?.full_name ?? "",
      job_title: job?.title ?? "",
      stage: stage.label,
    };

    for (const t of triggers ?? []) {
      if (t.trigger_type === "send_email") {
        if (!candidate?.email) { skipped.push({ id: t.id, reason: "candidate has no email" }); continue; }

        // Resolve subject/body: template overrides inline settings
        let subject = (t.settings as any)?.subject ?? `Update on your application for {{job_title}}`;
        let bodyText = (t.settings as any)?.body ?? `Hi {{candidate_name}},\n\nYour application has moved to: {{stage}}.\n`;
        if (t.template_id) {
          const { data: tpl } = await admin.from("templates").select("name, content").eq("id", t.template_id).maybeSingle();
          if (tpl) { subject = tpl.name; bodyText = tpl.content; }
        }
        subject = render(subject, vars);
        bodyText = render(bodyText, vars);

        const delayMin = Number(t.delay_minutes ?? 0);

        if (delayMin > 0) {
          // Enqueue for later processing
          const scheduledAt = new Date(Date.now() + delayMin * 60_000).toISOString();
          const { error: insErr } = await admin.from("outbound_email_queue").insert({
            workspace_id: workspaceId,
            candidate_id: jc.candidate_id,
            job_candidate_id: jc.id,
            template_id: t.template_id ?? null,
            scheduled_at: scheduledAt,
            payload: { to: candidate.email, subject, body: bodyText },
            status: "pending",
            created_by: userData.user.id,
          });
          if (insErr) skipped.push({ id: t.id, reason: `enqueue failed: ${insErr.message}` });
          else executed.push({ id: t.id, type: "send_email", recipient: candidate.email, delayed: true, scheduled_at: scheduledAt });
          continue;
        }

        // Immediate send via Resend (preserves current toast UX)
        if (!RESEND_API_KEY) { skipped.push({ id: t.id, reason: "RESEND_API_KEY not configured" }); continue; }
        const html = `<div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#111827;white-space:pre-wrap">${bodyText.replace(/[<>]/g, (c) => c === "<" ? "&lt;" : "&gt;")}</div>`;
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: [candidate.email], subject, html }),
        });
        if (!resp.ok) {
          const text = await resp.text();
          skipped.push({ id: t.id, reason: `email failed: ${text}` });
        } else {
          executed.push({ id: t.id, type: "send_email", recipient: candidate.email });
        }
      } else {
        skipped.push({ id: t.id, reason: `${t.trigger_type} not implemented` });
      }
    }

    return new Response(JSON.stringify({ executed, skipped, candidate_name: candidate?.full_name ?? "" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("execute-stage-trigger error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
