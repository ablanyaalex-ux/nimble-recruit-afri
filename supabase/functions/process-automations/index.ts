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

async function getApproverEmail(admin: any, userId: string): Promise<{ email: string | null; name: string }> {
  const { data: u } = await admin.auth.admin.getUserById(userId);
  const email = u?.user?.email ?? null;
  const { data: p } = await admin.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  const name = p?.display_name ?? email?.split("@")[0] ?? "there";
  return { email, name };
}

async function buildApprovalEmail(admin: any, jobId: string, approverId: string, token: string, publicUrl: string) {
  const { data: job } = await admin.from("jobs").select("title, clients(name)").eq("id", jobId).maybeSingle();
  const { email, name } = await getApproverEmail(admin, approverId);
  const link = `${publicUrl}/approve/${token}`;
  const subject = `Approval requested: ${job?.title ?? "Job"}`;
  const body = `Hi ${name},\n\nA new role needs your approval:\n\n${job?.title}${job?.clients?.name ? ` — ${job.clients.name}` : ""}\n\nReview & decide:\n${link}\n\nThis link expires in 7 days.`;
  return { email, subject, body, jobTitle: job?.title ?? "" };
}

async function advanceApproval(admin: any, jobId: string, publicUrl: string) {
  const { data: nextStep } = await admin
    .from("job_approval_steps")
    .select("id, approver_id, step_order")
    .eq("job_id", jobId)
    .eq("status", "waiting")
    .order("step_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!nextStep) {
    // No more waiting steps — chain complete
    await admin.from("jobs")
      .update({ approval_status: "approved", status: "open", approval_decided_at: new Date().toISOString() })
      .eq("id", jobId);
    return { advanced: false, complete: true };
  }

  const token = crypto.randomUUID().replace(/-/g, "");
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

  await admin.from("job_approval_steps").update({
    status: "pending",
    token,
    token_expires_at: expires,
  }).eq("id", nextStep.id);

  await admin.from("jobs").update({ approval_requested_from: nextStep.approver_id }).eq("id", jobId);

  const { data: job } = await admin.from("jobs").select("workspace_id").eq("id", jobId).maybeSingle();
  const built = await buildApprovalEmail(admin, jobId, nextStep.approver_id, token, publicUrl);
  if (built.email && job?.workspace_id) {
    await admin.from("outbound_email_queue").insert({
      workspace_id: job.workspace_id,
      payload: { to: built.email, subject: built.subject, body: built.body },
      scheduled_at: new Date().toISOString(),
      status: "pending",
    });
  }
  return { advanced: true, stepOrder: nextStep.step_order };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const mode = body.mode as string;
    const origin = req.headers.get("origin") ?? req.headers.get("referer") ?? "";
    const publicUrl = (body.publicUrl as string) || origin.replace(/\/$/, "");

    // ---- DRAIN ----
    if (mode === "drain") {
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

    // ---- APPROVAL: info (public, by token) ----
    if (mode === "approval_info") {
      const token = body.token as string;
      if (!token) return json({ error: "token required" }, 400);
      const { data: step } = await admin
        .from("job_approval_steps")
        .select("id, status, decided_at, note, token_expires_at, step_order, approver_id, jobs(id, title, description, location, employment_type, clients(name))")
        .eq("token", token)
        .maybeSingle();
      if (!step) return json({ error: "Invalid token" }, 404);
      const expired = step.token_expires_at && new Date(step.token_expires_at) < new Date();
      const { data: prof } = await admin.from("profiles").select("display_name").eq("id", step.approver_id).maybeSingle();
      return json({
        ok: true,
        status: step.status,
        decided_at: step.decided_at,
        note: step.note,
        expired,
        step_order: step.step_order,
        approver_name: prof?.display_name ?? "",
        job: step.jobs,
      });
    }

    // ---- APPROVAL: decide (public, by token) ----
    if (mode === "approval_decide") {
      const token = body.token as string;
      const decision = body.decision as "approved" | "rejected";
      const note = (body.note as string | undefined) ?? null;
      if (!token || !["approved", "rejected"].includes(decision)) {
        return json({ error: "Invalid input" }, 400);
      }
      const { data: step } = await admin
        .from("job_approval_steps")
        .select("id, job_id, status, token_expires_at, jobs(workspace_id)")
        .eq("token", token)
        .maybeSingle();
      if (!step) return json({ error: "Invalid token" }, 404);
      if (step.status !== "pending") return json({ error: "Already decided" }, 409);
      if (step.token_expires_at && new Date(step.token_expires_at) < new Date()) {
        return json({ error: "Link expired" }, 410);
      }

      await admin.from("job_approval_steps").update({
        status: decision,
        decided_at: new Date().toISOString(),
        note,
      }).eq("id", step.id);

      if (decision === "rejected") {
        await admin.from("jobs").update({
          approval_status: "rejected",
          approval_decided_at: new Date().toISOString(),
          approval_note: note,
        }).eq("id", step.job_id);
        return json({ ok: true, decision: "rejected" });
      }
      // Approved → advance chain
      const result = await advanceApproval(admin, step.job_id, publicUrl);
      return json({ ok: true, decision: "approved", ...result });
    }

    // ---- APPROVAL: kickoff (authenticated, called from wizard) ----
    if (mode === "approval_kickoff") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Unauthorized" }, 401);
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: u } = await userClient.auth.getUser();
      if (!u.user) return json({ error: "Unauthorized" }, 401);
      const jobId = body.jobId as string;
      if (!jobId) return json({ error: "jobId required" }, 400);
      const { data: job } = await admin.from("jobs").select("workspace_id").eq("id", jobId).maybeSingle();
      if (!job) return json({ error: "Not found" }, 404);
      const { data: canEdit } = await admin.rpc("can_edit_workspace", {
        _uid: u.user.id, _workspace_id: job.workspace_id,
      });
      if (!canEdit) return json({ error: "Forbidden" }, 403);
      const result = await advanceApproval(admin, jobId, publicUrl);
      return json({ ok: true, ...result });
    }

    // ---- APPROVAL: nudge ----
    if (mode === "approval_nudge") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Unauthorized" }, 401);
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: u } = await userClient.auth.getUser();
      if (!u.user) return json({ error: "Unauthorized" }, 401);
      const stepId = body.stepId as string;
      const { data: step } = await admin
        .from("job_approval_steps")
        .select("id, job_id, approver_id, token, status, jobs(workspace_id)")
        .eq("id", stepId).maybeSingle();
      if (!step || step.status !== "pending" || !step.token) return json({ error: "Step not pending" }, 400);
      const { data: canEdit } = await admin.rpc("can_edit_workspace", {
        _uid: u.user.id, _workspace_id: (step.jobs as any).workspace_id,
      });
      if (!canEdit) return json({ error: "Forbidden" }, 403);
      const built = await buildApprovalEmail(admin, step.job_id, step.approver_id, step.token, publicUrl);
      if (built.email) {
        await admin.from("outbound_email_queue").insert({
          workspace_id: (step.jobs as any).workspace_id,
          payload: { to: built.email, subject: `[Reminder] ${built.subject}`, body: built.body },
          scheduled_at: new Date().toISOString(),
          status: "pending",
          created_by: u.user.id,
        });
      }
      return json({ ok: true });
    }

    // ---- SUBMIT APPLICATION (public, anon) ----
    if (mode === "submit_application") {
      const { jobId, name, email, phone, answers } = body as {
        jobId: string;
        name: string;
        email: string;
        phone?: string;
        answers: Record<string, string>;
      };
      if (!jobId || !name?.trim() || !email?.trim()) {
        return json({ error: "Missing required fields" }, 400);
      }
      const { data: job } = await admin
        .from("jobs")
        .select("id, workspace_id, title, status, approval_status, created_by")
        .eq("id", jobId).maybeSingle();
      if (!job || job.status !== "open" || job.approval_status !== "approved") {
        return json({ error: "Job not accepting applications" }, 404);
      }

      const { data: questions } = await admin
        .from("job_application_questions")
        .select("id, question_text, options, is_knockout, fail_value, rejection_template_id");

      const jobQs = (questions ?? []).filter((q: any) => true); // RLS scopes already
      // Knockout: fail_value supports comma-separated multi
      let knockedOut: any = null;
      for (const q of jobQs) {
        if (!q.is_knockout || !q.fail_value) continue;
        const ans = (answers?.[q.id] ?? "").trim().toLowerCase();
        const fails = q.fail_value.split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean);
        if (ans && fails.includes(ans)) { knockedOut = q; break; }
      }

      // Insert candidate
      const { data: cand, error: candErr } = await admin.from("candidates").insert({
        workspace_id: job.workspace_id,
        full_name: name.trim(),
        email: email.trim(),
        phone: phone?.trim() || null,
        source: "careers_site",
        created_by: job.created_by,
      }).select("id").single();
      if (candErr) return json({ error: candErr.message }, 500);

      const { data: jc, error: jcErr } = await admin.from("job_candidates").insert({
        job_id: job.id,
        candidate_id: cand.id,
        added_by: job.created_by,
        stage: "application",
        rejected: !!knockedOut,
        rejected_at: knockedOut ? new Date().toISOString() : null,
        rejection_reason: knockedOut ? "Knockout question" : null,
      }).select("id").single();
      if (jcErr) return json({ error: jcErr.message }, 500);

      // Knockout → schedule rejection email 24h out
      if (knockedOut && knockedOut.rejection_template_id) {
        const { data: t } = await admin.from("templates")
          .select("name, content").eq("id", knockedOut.rejection_template_id).maybeSingle();
        if (t) {
          const vars = { candidate_name: name, job_title: job.title, company_name: "", stage: "" };
          await admin.from("outbound_email_queue").insert({
            workspace_id: job.workspace_id,
            candidate_id: cand.id,
            job_candidate_id: jc.id,
            template_id: knockedOut.rejection_template_id,
            payload: { to: email.trim(), subject: render(t.name, vars), body: render(t.content, vars) },
            scheduled_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
            status: "pending",
          });
        }
      }
      return json({ ok: true, knockedOut: !!knockedOut });
    }

    // ---- ENQUEUE_PUBLIC ----
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
        if (t) { bodyText = t.content; subject = t.name; }
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
        payload: { to: candidate.email, subject: render(subject, renderVars), body: render(bodyText, renderVars) },
        status: "pending",
      });
      if (error) return json({ error: error.message }, 500);
      return json({ enqueued: true });
    }

    // ---- ENQUEUE (authenticated) ----
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
