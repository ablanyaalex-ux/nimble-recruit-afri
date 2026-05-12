import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function render(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const mode = body.mode as "enqueue" | "drain" | "enqueue_public";

    // ---- DRAIN: send any pending emails whose scheduled_at <= now() ----
    if (mode === "drain") {
      // Auth required for manual drain
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Unauthorized" }, 401);
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: u } = await userClient.auth.getUser();
      if (!u.user) return json({ error: "Unauthorized" }, 401);
      const workspaceId = body.workspaceId as string | undefined;

      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      const from = Deno.env.get("INVITE_EMAIL_FROM") ?? "TalentFlow <onboarding@resend.dev>";

      let q = admin.from("outbound_email_queue")
        .select("id, workspace_id, payload, scheduled_at, attempts")
        .eq("status", "pending")
        .lte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(50);
      if (workspaceId) q = q.eq("workspace_id", workspaceId);
      const { data: rows } = await q;

      let sent = 0, failed = 0;
      for (const row of rows ?? []) {
        const payload = (row.payload ?? {}) as { to?: string; subject?: string; body?: string };
        if (!payload.to || !payload.subject) {
          await admin.from("outbound_email_queue").update({
            status: "failed", last_error: "missing to/subject", attempts: (row.attempts ?? 0) + 1,
          }).eq("id", row.id);
          failed++; continue;
        }
        if (!RESEND_API_KEY) {
          await admin.from("outbound_email_queue").update({
            status: "failed", last_error: "RESEND_API_KEY not configured", attempts: (row.attempts ?? 0) + 1,
          }).eq("id", row.id);
          failed++; continue;
        }
        const html = `<div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#111827;white-space:pre-wrap">${(payload.body ?? "").replace(/[<>]/g, (c) => c === "<" ? "&lt;" : "&gt;")}</div>`;
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: [payload.to], subject: payload.subject, html }),
        });
        if (resp.ok) {
          await admin.from("outbound_email_queue").update({
            status: "sent", sent_at: new Date().toISOString(), attempts: (row.attempts ?? 0) + 1,
          }).eq("id", row.id);
          sent++;
        } else {
          const text = await resp.text();
          await admin.from("outbound_email_queue").update({
            status: "failed", last_error: text.slice(0, 500), attempts: (row.attempts ?? 0) + 1,
          }).eq("id", row.id);
          failed++;
        }
      }
      return json({ sent, failed, processed: (rows ?? []).length });
    }

    // ---- ENQUEUE_PUBLIC: called from public application form (no auth needed) ----
    if (mode === "enqueue_public") {
      const { jobCandidateId, templateId, scheduledAt, vars } = body;
      if (!jobCandidateId) return json({ error: "jobCandidateId required" }, 400);

      const { data: jc } = await admin
        .from("job_candidates")
        .select("id, candidate_id, jobs(workspace_id, title), candidates(full_name, email)")
        .eq("id", jobCandidateId).maybeSingle();
      if (!jc) return json({ error: "Not found" }, 404);
      const job: any = jc.jobs;
      const candidate: any = jc.candidates;
      if (!candidate?.email) return json({ enqueued: false, reason: "no email" });

      let subject = vars?.subject ?? "Update on your application";
      let bodyText = vars?.body ?? "Thank you for applying.";
      if (templateId) {
        const { data: t } = await admin.from("templates").select("content, name").eq("id", templateId).maybeSingle();
        if (t) {
          // template content is body; subject derived from name + job
          bodyText = t.content;
          subject = t.name;
        }
      }
      const renderVars = {
        candidate_name: candidate.full_name ?? "",
        job_title: job?.title ?? "",
        company_name: vars?.company_name ?? "",
        stage: vars?.stage ?? "",
      };
      const renderedSubject = render(subject, renderVars);
      const renderedBody = render(bodyText, renderVars);

      const { error } = await admin.from("outbound_email_queue").insert({
        workspace_id: job.workspace_id,
        candidate_id: jc.candidate_id,
        job_candidate_id: jc.id,
        template_id: templateId ?? null,
        scheduled_at: scheduledAt ?? new Date().toISOString(),
        payload: { to: candidate.email, subject: renderedSubject, body: renderedBody },
        status: "pending",
      });
      if (error) return json({ error: error.message }, 500);
      return json({ enqueued: true });
    }

    // ---- ENQUEUE: authenticated, used by stage triggers / manual sends ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ error: "Unauthorized" }, 401);

    const { jobCandidateId, templateId, subject, body: emailBody, scheduledAt, vars } = body;
    if (!jobCandidateId) return json({ error: "jobCandidateId required" }, 400);

    const { data: jc } = await admin
      .from("job_candidates")
      .select("id, candidate_id, jobs(workspace_id, title), candidates(full_name, email)")
      .eq("id", jobCandidateId).maybeSingle();
    if (!jc) return json({ error: "Not found" }, 404);
    const job: any = jc.jobs;
    const candidate: any = jc.candidates;

    const { data: canEdit } = await admin.rpc("can_edit_workspace", {
      _uid: u.user.id, _workspace_id: job.workspace_id,
    });
    if (!canEdit) return json({ error: "Forbidden" }, 403);
    if (!candidate?.email) return json({ enqueued: false, reason: "no email" });

    let subj = subject ?? "Update on your application";
    let bodyText = emailBody ?? "";
    if (templateId) {
      const { data: t } = await admin.from("templates").select("content, name").eq("id", templateId).maybeSingle();
      if (t) { bodyText = t.content; subj = t.name; }
    }
    const renderVars = {
      candidate_name: candidate.full_name ?? "",
      job_title: job?.title ?? "",
      company_name: vars?.company_name ?? "",
      stage: vars?.stage ?? "",
    };
    const { error } = await admin.from("outbound_email_queue").insert({
      workspace_id: job.workspace_id,
      candidate_id: jc.candidate_id,
      job_candidate_id: jc.id,
      template_id: templateId ?? null,
      scheduled_at: scheduledAt ?? new Date().toISOString(),
      payload: { to: candidate.email, subject: render(subj, renderVars), body: render(bodyText, renderVars) },
      status: "pending",
      created_by: u.user.id,
    });
    if (error) return json({ error: error.message }, 500);
    return json({ enqueued: true });
  } catch (e) {
    console.error("process-automations error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
