import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const roleLabel = (role: string) => role.replace(/_/g, " ");

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

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY missing");

    const { email, inviteLink, role, workspaceName } = await req.json();
    if (!email || !inviteLink || !role) {
      return new Response(JSON.stringify({ error: "email, inviteLink and role are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const from = Deno.env.get("INVITE_EMAIL_FROM") ?? "Nimble Recruit <onboarding@resend.dev>";
    const workspace = workspaceName || "Nimble Recruit";
    const subject = `You're invited to ${workspace}`;
    const readableRole = roleLabel(role);

    const html = `
      <div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#111827">
        <h1 style="font-size:20px;margin:0 0 12px">You're invited to ${workspace}</h1>
        <p>You have been invited as a <strong>${readableRole}</strong>.</p>
        <p>
          <a href="${inviteLink}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 14px;border-radius:6px">
            Accept invite
          </a>
        </p>
        <p style="font-size:13px;color:#6b7280">If the button does not work, copy and paste this link into your browser:</p>
        <p style="font-size:13px;color:#374151;word-break:break-all">${inviteLink}</p>
      </div>
    `;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject,
        html,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("Resend error", resp.status, text);
      return new Response(JSON.stringify({ error: "Failed to send invite email" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-invite-email error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
