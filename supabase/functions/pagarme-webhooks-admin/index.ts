// Pagar.me Webhooks Admin
// Lista, obtém e reenvia webhooks (hooks) registrados no Pagar.me v5.
// Requer usuário autenticado com role 'admin'.
// API ref: https://docs.pagar.me/reference/listar-os-webhooks-1

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

interface ReqBody {
  action: 'list' | 'get' | 'resend';
  hook_id?: string;
  // optional filters for list
  page?: number;
  size?: number;
  status?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

  // ---------- Auth: must be admin ----------
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return json({ error: 'Não autenticado' }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) {
    return json({ error: 'Sessão inválida' }, 401);
  }
  const userId = claimsData.claims.sub as string;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: roleRow } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();
  if (!roleRow) return json({ error: 'Acesso restrito a administradores' }, 403);

  // ---------- Parse body ----------
  let body: ReqBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }

  if (!body?.action || !['list', 'get', 'resend'].includes(body.action)) {
    return json({ error: 'action inválida (use list | get | resend)' }, 400);
  }

  // ---------- Load Pagar.me secret key ----------
  const { data: settings } = await admin
    .from('site_settings')
    .select('key,value')
    .in('key', ['pagarme_environment', 'pagarme_secret_key', 'pagarme_secret_key_sandbox', 'pagarme_secret_key_production']);

  const map = new Map((settings || []).map((s: any) => [s.key, s.value]));
  const env = map.get('pagarme_environment') || 'sandbox';
  const secretKey =
    map.get(`pagarme_secret_key_${env}`) || map.get('pagarme_secret_key') || '';

  if (!secretKey) {
    return json({ error: 'Secret Key da Pagar.me não configurada' }, 400);
  }

  const baseUrl = 'https://api.pagar.me/core/v5';
  const authHeaderApi = 'Basic ' + btoa(`${secretKey}:`);

  const callPagarMe = async (path: string, method: string) => {
    const startedAt = Date.now();
    const url = `${baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': authHeaderApi,
      },
    });
    const elapsedMs = Date.now() - startedAt;
    const raw = await res.text();
    let data: any = {};
    if (raw) {
      try { data = JSON.parse(raw); } catch { data = { message: raw }; }
    }
    const preview = raw ? raw.slice(0, 800) : '';
    if (!res.ok) {
      console.error(
        `[pagarme-webhooks-admin] ${method} ${path} -> ${res.status} (${elapsedMs}ms) | ${preview}`,
      );
    } else {
      console.log(
        `[pagarme-webhooks-admin] ${method} ${path} -> ${res.status} (${elapsedMs}ms)`,
      );
    }
    return { ok: res.ok, status: res.status, data, elapsedMs };
  };

  try {
    if (body.action === 'list') {
      const params = new URLSearchParams();
      if (body.page) params.set('page', String(body.page));
      if (body.size) params.set('size', String(body.size));
      if (body.status) params.set('status', body.status);
      const qs = params.toString();
      const r = await callPagarMe(`/hooks${qs ? `?${qs}` : ''}`, 'GET');
      if (!r.ok) return json({ error: r.data?.message || `Erro ${r.status}`, raw: r.data }, r.status);
      return json({ ok: true, data: r.data, elapsed_ms: r.elapsedMs });
    }

    if (body.action === 'get') {
      if (!body.hook_id) return json({ error: 'hook_id é obrigatório' }, 400);
      const r = await callPagarMe(`/hooks/${encodeURIComponent(body.hook_id)}`, 'GET');
      if (!r.ok) return json({ error: r.data?.message || `Erro ${r.status}`, raw: r.data }, r.status);
      return json({ ok: true, data: r.data, elapsed_ms: r.elapsedMs });
    }

    if (body.action === 'resend') {
      if (!body.hook_id) return json({ error: 'hook_id é obrigatório' }, 400);
      const r = await callPagarMe(`/hooks/${encodeURIComponent(body.hook_id)}/retry`, 'POST');
      if (!r.ok) return json({ error: r.data?.message || `Erro ${r.status}`, raw: r.data }, r.status);
      return json({ ok: true, data: r.data, elapsed_ms: r.elapsedMs });
    }

    return json({ error: 'action desconhecida' }, 400);
  } catch (err: any) {
    console.error('[pagarme-webhooks-admin] Unexpected error:', err);
    return json({ error: err?.message || 'Erro interno' }, 500);
  }
});
