// Shared HTTP helpers: CORS, JSON responses and correlation-ID propagation.
// Used by every email-related Edge Function so that responses are consistent
// and traceable end-to-end (a single ID flows: caller → email-events →
// send-email → SMTP provider → email_send_log).

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-correlation-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Expose-Headers": "x-correlation-id",
};

/** Returns the inbound correlation id or generates a new one. */
export function getCorrelationId(req: Request): string {
  const incoming = req.headers.get("x-correlation-id");
  if (incoming && /^[A-Za-z0-9_\-]{6,128}$/.test(incoming)) return incoming;
  return `cid_${crypto.randomUUID()}`;
}

/** Standard JSON response that always echoes the correlation id back. */
export function json(status: number, body: unknown, correlationId?: string) {
  const headers: Record<string, string> = {
    ...corsHeaders,
    "Content-Type": "application/json",
  };
  if (correlationId) headers["x-correlation-id"] = correlationId;
  return new Response(JSON.stringify(body), { status, headers });
}

export function preflight(req: Request, correlationId?: string) {
  if (req.method !== "OPTIONS") return null;
  const headers: Record<string, string> = { ...corsHeaders };
  if (correlationId) headers["x-correlation-id"] = correlationId;
  return new Response(null, { headers });
}