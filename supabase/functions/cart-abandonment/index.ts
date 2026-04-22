// Cron-style sweeper: encontra carrinhos abandonados há > 2h e envia
// e-mail (uma vez por usuário a cada 24h) usando a Edge Function
// `send-email` (SMTP Hostinger). Não fala mais com Resend.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: cartItems } = await supabase
      .from("cart_items")
      .select("user_id, product_id, variation_id, quantity, updated_at")
      .lt("updated_at", twoHoursAgo);

    if (!cartItems || cartItems.length === 0) {
      return new Response(JSON.stringify({ message: "No abandoned carts found", sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userCarts: Record<string, typeof cartItems> = {};
    cartItems.forEach((item) => {
      if (!userCarts[item.user_id]) userCarts[item.user_id] = [];
      userCarts[item.user_id].push(item);
    });

    const userIds = Object.keys(userCarts);

    const { data: recentLogs } = await supabase
      .from("cart_abandonment_logs")
      .select("user_id")
      .in("user_id", userIds)
      .gt("email_sent_at", oneDayAgo);
    const recentlyEmailed = new Set((recentLogs || []).map((l: any) => l.user_id));

    const eligibleUserIds = userIds.filter((uid) => !recentlyEmailed.has(uid));
    if (eligibleUserIds.length === 0) {
      return new Response(JSON.stringify({ message: "All users already emailed recently", sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: prefs } = await supabase
      .from("contact_preferences")
      .select("user_id, allow_email_marketing")
      .in("user_id", eligibleUserIds);
    const optedOut = new Set(
      (prefs || []).filter((p: any) => p.allow_email_marketing === false).map((p: any) => p.user_id),
    );
    const consentingUserIds = eligibleUserIds.filter((uid) => !optedOut.has(uid));
    if (consentingUserIds.length === 0) {
      return new Response(JSON.stringify({ message: "All eligible users opted out", sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", consentingUserIds);
    const profileMap: Record<string, string> = {};
    (profiles || []).forEach((p: any) => { profileMap[p.user_id] = p.full_name; });

    const { data: { users: authUsers } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const emailMap: Record<string, string> = {};
    (authUsers || []).forEach((u: any) => { emailMap[u.id] = u.email; });

    const productIds = [...new Set(cartItems.map((i) => i.product_id))];
    const { data: products } = await supabase
      .from("products")
      .select("id, name")
      .in("id", productIds);

    // Buscar dados completos das variações para enriquecer payload do template
    const variationIds = [...new Set(cartItems.map((i) => i.variation_id).filter(Boolean))];
    const { data: variations } = await supabase
      .from("product_variations")
      .select("id, dosage, price, offer_price, is_offer")
      .in("id", variationIds);

    const productMap: Record<string, string> = {};
    (products || []).forEach((p: any) => { productMap[p.id] = p.name; });
    const variationMap: Record<string, any> = {};
    (variations || []).forEach((v: any) => { variationMap[v.id] = v; });

    let sentCount = 0;

    for (const userId of consentingUserIds) {
      const email = emailMap[userId];
      if (!email) continue;

      const name = profileMap[userId] || "Cliente";
      const items = userCarts[userId];

      const itemsPayload = items.map((i: any) => {
        const v = variationMap[i.variation_id] || {};
        const price = v.is_offer && v.offer_price ? v.offer_price : (v.price ?? 0);
        return {
          product_name: productMap[i.product_id] || "Produto",
          dosage: v.dosage,
          quantity: i.quantity,
          price: Number(price),
        };
      });
      const total = itemsPayload.reduce((acc, i) => acc + i.price * i.quantity, 0);

      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            template: "cart_abandonment",
            to: email,
            data: {
              full_name: name,
              items: itemsPayload,
              total_value: total,
            },
          }),
        });
        if (res.ok) {
          await supabase.from("cart_abandonment_logs").insert({
            user_id: userId,
            cart_item_count: items.length,
          });
          sentCount++;
        } else {
          const t = await res.text();
          console.error(`send-email failed for ${email}: ${res.status} ${t}`);
        }
      } catch (e) {
        console.error(`Failed to send email to ${email}:`, e);
      }
    }

    return new Response(JSON.stringify({ message: `Sent ${sentCount} abandonment emails`, sent: sentCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Cart abandonment error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
