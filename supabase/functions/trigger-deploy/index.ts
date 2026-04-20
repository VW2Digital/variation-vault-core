// =============================================================================
// trigger-deploy — chama o deploy-webhook na VPS para puxar atualização do git
// =============================================================================
// Apenas usuários com role `admin` podem invocar. A URL e o token do webhook
// ficam em site_settings (deploy_webhook_url, deploy_webhook_token).
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth
      .getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return json({ error: "unauthorized" }, 401);
    }
    const userId = claimsData.claims.sub as string;

    // Verifica role admin via RPC has_role
    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr || !isAdmin) {
      return json({ error: "forbidden — admin only" }, 403);
    }

    // Service role para ler settings sem RLS conflict (settings já são SELECT public, mas service garante)
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: settings, error: sErr } = await admin
      .from("site_settings")
      .select("key,value")
      .in("key", ["deploy_webhook_url", "deploy_webhook_token"]);
    if (sErr) return json({ error: sErr.message }, 500);

    const map = new Map(settings?.map((r) => [r.key, r.value]) ?? []);
    const url = (map.get("deploy_webhook_url") || "").trim();
    const wToken = (map.get("deploy_webhook_token") || "").trim();

    if (!url || !wToken) {
      return json({
        error:
          "Configure deploy_webhook_url e deploy_webhook_token em Configurações → Avançado.",
      }, 400);
    }

    const body = await req.json().catch(() => ({}));
    const action = (body?.action ?? "deploy") as "deploy" | "health" | "status";
    const path = action === "deploy" ? "/deploy" : `/${action}`;
    const target = url.replace(/\/$/, "") + path;

    const startedAt = Date.now();
    const resp = await fetch(target, {
      method: action === "deploy" ? "POST" : "GET",
      headers: {
        "X-Deploy-Token": wToken,
        "Content-Type": "application/json",
      },
      body: action === "deploy" ? "{}" : undefined,
    });
    const text = await resp.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch { /* keep text */ }

    return json({
      ok: resp.ok,
      status: resp.status,
      latency_ms: Date.now() - startedAt,
      response: parsed,
    }, resp.ok ? 200 : resp.status);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}