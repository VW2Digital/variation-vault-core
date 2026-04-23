// Shared admin/service-role authorization for Edge Functions.
// Two valid auth modes:
//   1) Service role key (server-to-server, e.g. webhooks → send-email)
//   2) Admin JWT (called from the admin panel)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AuthorizeResult {
  authorized: boolean;
  caller: "service_role" | "admin_user" | "anonymous";
  user_id: string | null;
}

export async function authorizeAdminOrServiceRole(req: Request): Promise<AuthorizeResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return { authorized: false, caller: "anonymous", user_id: null };

  if (token === serviceRoleKey) {
    return { authorized: true, caller: "service_role", user_id: null };
  }

  try {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: claimsData } = await userClient.auth.getClaims(token);
    const callerId = claimsData?.claims?.sub ?? null;
    if (!callerId) return { authorized: false, caller: "anonymous", user_id: null };

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();

    if (roleRow) return { authorized: true, caller: "admin_user", user_id: callerId };
    return { authorized: false, caller: "anonymous", user_id: callerId };
  } catch (_e) {
    return { authorized: false, caller: "anonymous", user_id: null };
  }
}