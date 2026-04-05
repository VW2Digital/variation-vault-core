import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// Rate limiting: max 60 requests per minute per IP
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): { limited: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { limited: false, remaining: RATE_LIMIT_MAX - 1, resetIn: RATE_LIMIT_WINDOW_MS };
  }

  entry.count++;
  const resetIn = Math.ceil((entry.resetAt - now) / 1000);
  if (entry.count > RATE_LIMIT_MAX) {
    return { limited: true, remaining: 0, resetIn };
  }
  return { limited: false, remaining: RATE_LIMIT_MAX - entry.count, resetIn };
}

// Cleanup stale entries every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap) {
    if (now >= val.resetAt) rateLimitMap.delete(key);
  }
}, 300_000);

Deno.serve(async (req) => {
  const startTime = Date.now();
  const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
  const userAgent = req.headers.get("user-agent") || "unknown";

  const log = (status: number, message: string, extra?: Record<string, unknown>) => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      ip: clientIp,
      user_agent: userAgent,
      method: req.method,
      path: new URL(req.url).pathname,
      status,
      message,
      duration_ms: Date.now() - startTime,
      ...extra,
    }));
  };

  if (req.method === "OPTIONS") {
    log(204, "CORS preflight");
    return new Response(null, { headers: corsHeaders });
  }

  // Rate limit check
  const rateLimit = checkRateLimit(clientIp);
  const rateLimitHeaders = {
    "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
    "X-RateLimit-Remaining": String(rateLimit.remaining),
    "Retry-After": String(rateLimit.resetIn),
  };

  if (rateLimit.limited) {
    log(429, "Rate limited", { remaining: 0 });
    return new Response(JSON.stringify({ error: "Too many requests. Try again later." }), {
      status: 429,
      headers: { ...corsHeaders, ...rateLimitHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "GET") {
    log(405, "Method not allowed");
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = req.headers.get("x-api-key");

  if (!apiKey) {
    log(401, "Missing API key");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Validate API key from site_settings
  const { data: keyRow } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "orders_api_key")
    .maybeSingle();

  if (!keyRow?.value || apiKey !== keyRow.value) {
    log(401, "Invalid API key");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const params = url.searchParams;

  // Build query with exact count for pagination
  let query = supabase.from("orders").select("*", { count: "exact" });

  // Filters (case-insensitive for status fields)
  const id = params.get("id");
  if (id) query = query.eq("id", id);

  const status = params.get("status");
  if (status) query = query.ilike("status", status);

  const payment_method = params.get("payment_method");
  if (payment_method) query = query.ilike("payment_method", payment_method);

  const payment_gateway = params.get("payment_gateway");
  if (payment_gateway) query = query.ilike("payment_gateway", payment_gateway);

  const customer_email = params.get("customer_email");
  if (customer_email) query = query.ilike("customer_email", `%${customer_email}%`);

  const customer_name = params.get("customer_name");
  if (customer_name) query = query.ilike("customer_name", `%${customer_name}%`);

  const customer_cpf = params.get("customer_cpf");
  if (customer_cpf) query = query.eq("customer_cpf", customer_cpf);

  const product_name = params.get("product_name");
  if (product_name) query = query.ilike("product_name", `%${product_name}%`);

  const coupon_code = params.get("coupon_code");
  if (coupon_code) query = query.ilike("coupon_code", coupon_code);

  const delivery_status = params.get("delivery_status");
  if (delivery_status) query = query.ilike("delivery_status", delivery_status);

  const shipping_service = params.get("shipping_service");
  if (shipping_service) query = query.eq("shipping_service", shipping_service);

  const min_value = params.get("min_value");
  if (min_value) query = query.gte("total_value", parseFloat(min_value));

  const max_value = params.get("max_value");
  if (max_value) query = query.lte("total_value", parseFloat(max_value));

  const date_from = params.get("date_from");
  if (date_from) query = query.gte("created_at", date_from);

  const date_to = params.get("date_to");
  if (date_to) query = query.lte("created_at", date_to);

  // Pagination
  const page = parseInt(params.get("page") || "1");
  const per_page = Math.min(parseInt(params.get("per_page") || "50"), 100);
  const from = (page - 1) * per_page;
  const to = from + per_page - 1;

  // Sort
  const sort_by = params.get("sort_by") || "created_at";
  const sort_order = params.get("sort_order") === "asc" ? true : false;
  query = query.order(sort_by, { ascending: sort_order });

  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    log(500, "Query error", { error: error.message });
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const filters = Object.fromEntries([...params.entries()].filter(([k]) => !["page", "per_page", "sort_by", "sort_order"].includes(k)));
  log(200, "Success", { results: data?.length ?? 0, filters, page, per_page });

  return new Response(
    JSON.stringify({
      data,
      pagination: { page, per_page, total: count },
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
