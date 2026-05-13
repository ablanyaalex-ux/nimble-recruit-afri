import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function render(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

// Build a simple .ics file for a single event
function buildIcs(opts: {
  uid: string; title: string; description: string; start: Date; end: Date; organizerEmail?: string;
}): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TalentFlow//Interviews//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${opts.uid}`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(opts.start)}`,
    `DTEND:${fmt(opts.end)}`,
    `SUMMARY:${esc(opts.title)}`,
    `DESCRIPTION:${esc(opts.description)}`,
    opts.organizerEmail ? `ORGANIZER:mailto:${opts.organizerEmail}` : "",
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

// Generate availability slots for the next N days
async function computeSlots(admin: any, interview: any, daysAhead = 14, slotMinutes = 30) {
  const interviewerIds: string[] = interview.interviewer_ids ?? [];
  if (interviewerIds.length === 0) return [];
  const duration = interview.duration_minutes ?? 45;

  // Fetch availability for all interviewers
  const { data: avail } = await admin
    .from("interviewer_availability")
    .select("user_id, day_of_week, start_time, end_time, buffer_minutes")
    .in("user_id", interviewerIds);

  // Existing booked schedules for those interviewers
  const fromIso = new Date().toISOString();
  const toIso = new Date(Date.now() + daysAhead * 86400_000).toISOString();
  const { data: existing } = await admin
    .from("interview_schedules")
    .select("scheduled_at, duration_minutes, interviewer_ids")
    .in("status", ["scheduled"])
    .gte("scheduled_at", fromIso)
    .lte("scheduled_at", toIso);

  // Build buffer (max across interviewers)
  const buffer = Math.max(0, ...(avail ?? []).map((a: any) => Number(a.buffer_minutes ?? 15)));

  // group availability per user per day
  const availByUser = new Map<string, Map<number, Array<[number, number]>>>();
  for (const a of avail ?? []) {
    if (!availByUser.has(a.user_id)) availByUser.set(a.user_id, new Map());
    const m = availByUser.get(a.user_id)!;
    if (!m.has(a.day_of_week)) m.set(a.day_of_week, []);
    const [sh, sm] = a.start_time.split(":").map(Number);
    const [eh, em] = a.end_time.split(":").map(Number);
    m.get(a.day_of_week)!.push([sh * 60 + sm, eh * 60 + em]);
  }

  const slots: string[] = [];
  const now = Date.now();
  const startDay = new Date(); startDay.setHours(0, 0, 0, 0);

  for (let d = 0; d < daysAhead; d++) {
    const dayDate = new Date(startDay.getTime() + d * 86400_000);
    const dow = dayDate.getDay();
    // Each user must have a window covering the slot
    for (let mins = 0; mins < 24 * 60; mins += slotMinutes) {
      const slotStart = new Date(dayDate.getTime() + mins * 60_000);
      const slotEnd = new Date(slotStart.getTime() + duration * 60_000);
      if (slotStart.getTime() < now + 60 * 60_000) continue; // at least 1h notice

      let allFree = true;
      for (const uid of interviewerIds) {
        const dayWindows = availByUser.get(uid)?.get(dow) ?? [];
        const fits = dayWindows.some(([s, e]) => mins >= s && mins + duration <= e);
        if (!fits) { allFree = false; break; }
      }
      if (!allFree) continue;

      // Check no booking conflict with buffer
      const conflict = (existing ?? []).some((b: any) => {
        if (!b.scheduled_at) return false;
        const bs = new Date(b.scheduled_at).getTime() - buffer * 60_000;
        const be = bs + (b.duration_minutes ?? 45) * 60_000 + buffer * 60_000 * 2;
        const overlaps = slotStart.getTime() < be && slotEnd.getTime() > bs;
        if (!overlaps) return false;
        const sharedInterviewer = (b.interviewer_ids ?? []).some((u: string) => interviewerIds.includes(u));
        return sharedInterviewer;
      });
      if (conflict) continue;

      slots.push(slotStart.toISOString());
    }
  }
  return slots;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const mode = body.mode as string;

    // ---- Public: get interview info + slots by token ----
    if (mode === "info") {
      const token = body.token as string;
      if (!token) return json({ error: "token required" }, 400);
      const { data: interview } = await admin
        .from("interview_schedules")
        .select("id, status, scheduled_at, duration_minutes, interviewer_ids, schedule_token, job_candidate_id, job_candidates(jobs(title, clients(name)), candidates(full_name, email))")
        .eq("schedule_token", token)
        .maybeSingle();
      if (!interview) return json({ error: "Invalid token" }, 404);
      const slots = interview.status === "pending_scheduling"
        ? await computeSlots(admin, interview)
        : [];
      const jc: any = interview.job_candidates;
      return json({
        ok: true,
        status: interview.status,
        scheduled_at: interview.scheduled_at,
        duration_minutes: interview.duration_minutes,
        job_title: jc?.jobs?.title ?? "",
        company_name: jc?.jobs?.clients?.name ?? "",
        candidate_name: jc?.candidates?.full_name ?? "",
        slots,
      });
    }

    // ---- Public: book a slot ----
    if (mode === "book") {
      const { token, slot } = body;
      if (!token || !slot) return json({ error: "token and slot required" }, 400);
      const { data: interview } = await admin
        .from("interview_schedules")
        .select("id, workspace_id, status, duration_minutes, interviewer_ids, job_candidate_id, job_candidates(jobs(title), candidates(full_name, email))")
        .eq("schedule_token", token)
        .maybeSingle();
      if (!interview) return json({ error: "Invalid token" }, 404);
      if (interview.status !== "pending_scheduling") return json({ error: "Already scheduled" }, 409);

      const start = new Date(slot);
      const end = new Date(start.getTime() + (interview.duration_minutes ?? 45) * 60_000);

      await admin.from("interview_schedules")
        .update({ status: "scheduled", scheduled_at: start.toISOString() })
        .eq("id", interview.id);

      // Upsert pending scorecards (idempotent for rebooks/reschedules)
      for (const uid of (interview.interviewer_ids ?? [])) {
        await admin.from("interview_scorecards")
          .upsert({
            interview_id: interview.id,
            interviewer_id: uid,
            ratings: {},
          }, { onConflict: "interview_id,interviewer_id" });
      }

      const jc: any = interview.job_candidates;
      const candidate = jc?.candidates;
      const jobTitle = jc?.jobs?.title ?? "Interview";
      const candName = candidate?.full_name ?? "Candidate";
      const ics = buildIcs({
        uid: `${interview.id}@talentflow`,
        title: `Interview: ${candName} — ${jobTitle}`,
        description: `Interview for the ${jobTitle} role.`,
        start, end,
      });

      // Confirmation to candidate
      if (candidate?.email) {
        await admin.from("outbound_email_queue").insert({
          workspace_id: interview.workspace_id,
          payload: {
            to: candidate.email,
            subject: `Interview confirmed — ${jobTitle}`,
            body: `Hi ${candName},\n\nYour interview for ${jobTitle} is confirmed for ${start.toUTCString()}.\n\nLooking forward to speaking with you.`,
            ics,
          },
          scheduled_at: new Date().toISOString(),
          status: "pending",
        });

        // 24h reminder
        const remindAt = new Date(start.getTime() - 24 * 3600_000);
        if (remindAt.getTime() > Date.now()) {
          await admin.from("outbound_email_queue").insert({
            workspace_id: interview.workspace_id,
            payload: {
              to: candidate.email,
              subject: `Reminder: interview tomorrow — ${jobTitle}`,
              body: `Hi ${candName},\n\nFriendly reminder of your interview for ${jobTitle} on ${start.toUTCString()}.`,
            },
            scheduled_at: remindAt.toISOString(),
            status: "pending",
          });
        }
      }

      // Email each interviewer + post-interview scorecard prompt
      for (const uid of (interview.interviewer_ids ?? [])) {
        const { data: u } = await admin.auth.admin.getUserById(uid);
        const email = u?.user?.email;
        if (!email) continue;

        await admin.from("outbound_email_queue").insert({
          workspace_id: interview.workspace_id,
          payload: {
            to: email,
            subject: `Interview scheduled: ${candName} (${jobTitle})`,
            body: `Hi,\n\nYou have an interview with ${candName} for ${jobTitle} on ${start.toUTCString()}.`,
            ics,
          },
          scheduled_at: new Date().toISOString(),
          status: "pending",
        });

        // Feedback prompt: scheduled_at + duration + 5 minutes
        const feedbackAt = new Date(end.getTime() + 5 * 60_000);
        await admin.from("outbound_email_queue").insert({
          workspace_id: interview.workspace_id,
          payload: {
            to: email,
            subject: `How did it go? Scorecard for ${candName}`,
            body: `Hi,\n\nPlease take a moment to complete the scorecard for ${candName}.\n\nLink: /interviews/${interview.id}/scorecard/${uid}`,
          },
          scheduled_at: feedbackAt.toISOString(),
          status: "pending",
        });
      }

      return json({ ok: true, scheduled_at: start.toISOString() });
    }

    // ---- Authenticated modes ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ error: "Unauthorized" }, 401);

    // Create an interview row from CandidateDrawer / stage trigger
    if (mode === "create") {
      const { jobCandidateId, interviewerIds, durationMinutes, stageId } = body;
      if (!jobCandidateId || !Array.isArray(interviewerIds) || interviewerIds.length === 0) {
        return json({ error: "jobCandidateId + interviewerIds required" }, 400);
      }
      const { data: jc } = await admin.from("job_candidates").select("id, jobs(workspace_id)").eq("id", jobCandidateId).maybeSingle();
      const wsId = (jc?.jobs as any)?.workspace_id;
      if (!wsId) return json({ error: "Not found" }, 404);
      const { data: canEdit } = await admin.rpc("can_edit_workspace", { _uid: u.user.id, _workspace_id: wsId });
      if (!canEdit) return json({ error: "Forbidden" }, 403);

      const { data: row, error } = await admin.from("interview_schedules").insert({
        workspace_id: wsId,
        job_candidate_id: jobCandidateId,
        stage_id: stageId ?? null,
        interviewer_ids: interviewerIds,
        duration_minutes: durationMinutes ?? 45,
        status: "pending_scheduling",
        created_by: u.user.id,
      }).select("id, schedule_token").single();
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, id: row.id, schedule_token: row.schedule_token });
    }

    // Reschedule an existing interview (recruiter updates interviewers, duration, stage)
    if (mode === "reschedule") {
      const { interviewId, interviewerIds, durationMinutes, stageId } = body;
      if (!interviewId) return json({ error: "interviewId required" }, 400);

      const { data: existing } = await admin
        .from("interview_schedules")
        .select("id, workspace_id, job_candidate_id, interviewer_ids, duration_minutes, stage_id, status, scheduled_at")
        .eq("id", interviewId)
        .maybeSingle();
      if (!existing) return json({ error: "Interview not found" }, 404);

      const { data: canEdit } = await admin.rpc("can_edit_workspace", { _uid: u.user.id, _workspace_id: existing.workspace_id });
      if (!canEdit) return json({ error: "Forbidden" }, 403);

      const updateData: any = {
        status: "pending_scheduling",
        scheduled_at: null,
      };
      if (Array.isArray(interviewerIds) && interviewerIds.length > 0) updateData.interviewer_ids = interviewerIds;
      if (typeof durationMinutes === "number") updateData.duration_minutes = durationMinutes;
      if (typeof stageId !== "undefined") updateData.stage_id = stageId ?? null;

      const { data: updated, error: updErr } = await admin
        .from("interview_schedules")
        .update(updateData)
        .eq("id", interviewId)
        .select("id, schedule_token, interviewer_ids")
        .single();
      if (updErr) return json({ error: updErr.message }, 500);

      // If interviewers changed, clean up old scorecards and create new ones
      const newIds: string[] = updated.interviewer_ids ?? [];
      const oldIds: string[] = existing.interviewer_ids ?? [];
      const removed = oldIds.filter((id: string) => !newIds.includes(id));
      const added = newIds.filter((id: string) => !oldIds.includes(id));

      if (removed.length) {
        await admin.from("interview_scorecards")
          .delete()
          .eq("interview_id", interviewId)
          .in("interviewer_id", removed);
      }
      for (const uid of added) {
        await admin.from("interview_scorecards").insert({
          interview_id: interviewId,
          interviewer_id: uid,
          ratings: {},
        }).select();
      }

      return json({ ok: true, id: updated.id, schedule_token: updated.schedule_token });
    }

    return json({ error: "Unknown mode" }, 400);
  } catch (e) {
    console.error("interview-scheduling error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
