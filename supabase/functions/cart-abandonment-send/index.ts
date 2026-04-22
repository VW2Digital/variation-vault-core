// Admin-triggered: envia email de carrinho abandonado para 1 usuário.
// Encaminha para a Edge Function send-email (SMTP Hostinger).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CartItemPayload {
  product_name: string;
  dosage?: string;
  quantity: number;
  price: number;
}
interface SendPayload {
  user_id: string;
  email?: string;
  full_name?: string;
  items: CartItemPayload[];
  total_value: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = claimsData.claims.sub;

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = (await req.json()) as SendPayload;
    if (!payload?.user_id || !Array.isArray(payload.items) || payload.items.length === 0) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: pref } = await admin
      .from("contact_preferences")
      .select("allow_email_marketing")
      .eq("user_id", payload.user_id)
      .maybeSingle();
    if (pref && pref.allow_email_marketing === false) {
      return new Response(JSON.stringify({
        error: "Cliente optou por não receber emails de marketing.",
        opted_out: true,
      }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let recipient = payload.email || "";
    const recipientName = payload.full_name || "Cliente";
    if (!recipient) {
      const { data: { user } } = await admin.auth.admin.getUserById(payload.user_id);
      recipient = user?.email || "";
    }
    if (!recipient) {
      return new Response(JSON.stringify({ error: "Cliente sem email cadastrado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        template: "cart_abandonment",
        to: recipient,
        data: {
          full_name: recipientName,
          items: payload.items,
          total_value: payload.total_value,
        },
      }),
    });

    const resBody = await res.json().catch(() => ({}));
    if (!res.ok) {
      return new Response(JSON.stringify({ error: resBody?.error || "Falha ao enviar email", detail: resBody }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await admin.from("cart_abandonment_logs").insert({
      user_id: payload.user_id,
      cart_item_count: payload.items.length,
    });

    return new Response(JSON.stringify({ success: true, to: recipient }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("cart-abandonment-send error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
