import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PAID_STATUSES = ["PAID", "CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing auth token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: claimsData, error: claimsErr } =
      await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const fileId = body.file_id as string | undefined;
    if (!fileId) {
      return new Response(JSON.stringify({ error: "file_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Load file + variation + product info
    const { data: file, error: fileErr } = await admin
      .from("product_variation_files")
      .select(
        "id, file_path, file_name, mime_type, variation_id, product_variations:variation_id(product_id, products:product_id(name))",
      )
      .eq("id", fileId)
      .maybeSingle();

    if (fileErr || !file) {
      return new Response(JSON.stringify({ error: "File not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // @ts-ignore nested type
    const productName: string | undefined =
      file.product_variations?.products?.name;

    if (!productName) {
      return new Response(
        JSON.stringify({ error: "Product not found for file" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Verify the user has at least one paid order matching this product
    const { data: orders, error: ordersErr } = await admin
      .from("orders")
      .select("id, status, product_name")
      .eq("customer_user_id", userId)
      .ilike("product_name", `%${productName}%`);

    if (ordersErr) {
      return new Response(JSON.stringify({ error: ordersErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hasPaid = (orders ?? []).some((o) =>
      PAID_STATUSES.includes(String(o.status).toUpperCase()),
    );

    if (!hasPaid) {
      return new Response(
        JSON.stringify({
          error:
            "Você não tem um pedido pago para este produto. Entre em contato com o suporte se acreditar que é um erro.",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Generate signed URL (10 min)
    const { data: signed, error: signErr } = await admin.storage
      .from("digital-files")
      .createSignedUrl(file.file_path, 600, {
        download: file.file_name,
      });

    if (signErr || !signed?.signedUrl) {
      return new Response(
        JSON.stringify({
          error: signErr?.message ?? "Could not generate download URL",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        url: signed.signedUrl,
        file_name: file.file_name,
        mime_type: file.mime_type,
        expires_in: 600,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});