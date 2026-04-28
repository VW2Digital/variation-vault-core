// Disparador de e-mails em massa.
// Recebe uma lista de destinatários (já resolvida no frontend) + assunto +
// HTML, cria um registro em bulk_email_campaigns e envia em lotes
// reutilizando a Edge Function send-email (template "custom"), com
// throttling para evitar rate-limit do SMTP.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Recipient {
  email: string;
  name?: string;
}

interface BulkSendBody {
  subject: string;
  html: string;
  recipients: Recipient[];
  audience_type: string;
  batch_size?: number;
  delay_ms?: number;
}

function isEmail(s: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}

function interpolate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k) =>
    vars[k] !== undefined ? vars[k] : "",
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Authorization: must be admin
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as BulkSendBody;
    if (!body?.subject || !body?.html || !Array.isArray(body?.recipients)) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios: subject, html, recipients[]" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Dedup + valida
    const seen = new Set<string>();
    const recipients: Recipient[] = [];
    for (const r of body.recipients) {
      const email = (r?.email || "").trim().toLowerCase();
      if (!email || !isEmail(email) || seen.has(email)) continue;
      seen.add(email);
      recipients.push({ email, name: (r?.name || "").trim() });
    }

    if (recipients.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhum destinatário válido informado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Limite de segurança
    if (recipients.length > 5000) {
      return new Response(
        JSON.stringify({ error: "Máximo de 5000 destinatários por envio" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Cria a campanha
    const { data: campaign, error: campErr } = await admin
      .from("bulk_email_campaigns")
      .insert({
        created_by: userId,
        subject: body.subject,
        html_content: body.html,
        audience_type: body.audience_type || "manual",
        total_recipients: recipients.length,
        status: "processing",
      })
      .select()
      .single();

    if (campErr || !campaign) {
      return new Response(
        JSON.stringify({ error: "Falha ao registrar campanha", details: campErr?.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const batchSize = Math.min(Math.max(body.batch_size ?? 10, 1), 50);
    const delayMs = Math.min(Math.max(body.delay_ms ?? 500, 0), 5000);

    let sent = 0;
    let failed = 0;
    const failures: Array<{ email: string; error: string }> = [];

    const sendOne = async (r: Recipient) => {
      try {
        const personalizedHtml = interpolate(body.html, {
          nome: r.name || "Cliente",
          name: r.name || "Cliente",
          email: r.email,
        });
        const personalizedSubject = interpolate(body.subject, {
          nome: r.name || "Cliente",
          name: r.name || "Cliente",
          email: r.email,
        });

        const resp = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            template: "custom",
            to: r.email,
            subject: personalizedSubject,
            html: personalizedHtml,
          }),
        });

        if (!resp.ok) {
          const txt = await resp.text();
          failed++;
          failures.push({ email: r.email, error: txt.slice(0, 200) });
        } else {
          sent++;
        }
      } catch (e) {
        failed++;
        failures.push({ email: r.email, error: (e as Error).message });
      }
    };

    // Processa em lotes paralelos com pausa entre lotes
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      await Promise.all(batch.map(sendOne));
      if (i + batchSize < recipients.length && delayMs > 0) {
        await new Promise((res) => setTimeout(res, delayMs));
      }
    }

    await admin
      .from("bulk_email_campaigns")
      .update({
        total_sent: sent,
        total_failed: failed,
        status: failed === 0 ? "completed" : sent === 0 ? "failed" : "completed",
        completed_at: new Date().toISOString(),
        metadata: { failures: failures.slice(0, 50) },
      })
      .eq("id", campaign.id);

    return new Response(
      JSON.stringify({
        success: true,
        campaign_id: campaign.id,
        total_recipients: recipients.length,
        sent,
        failed,
        failures: failures.slice(0, 10),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});