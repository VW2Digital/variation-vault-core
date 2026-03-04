import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function getSetting(supabase: any, key: string) {
  const { data } = await supabase.from('site_settings').select('value').eq('key', key).maybeSingle();
  return data?.value || '';
}

async function upsertSetting(supabase: any, key: string, value: string, userId: string) {
  const { data: existing } = await supabase.from('site_settings').select('id').eq('key', key).maybeSingle();
  if (existing) {
    await supabase.from('site_settings').update({ value, user_id: userId }).eq('id', existing.id);
  } else {
    await supabase.from('site_settings').insert({ key, value, user_id: userId });
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    const action = body.action; // 'get_auth_url', 'exchange_code', 'refresh_token'
    const userId = body.user_id;

    if (!userId) throw new Error('user_id é obrigatório');

    const clientId = await getSetting(supabase, 'melhor_envio_client_id');
    const clientSecret = await getSetting(supabase, 'melhor_envio_client_secret');
    const env = (await getSetting(supabase, 'melhor_envio_environment')) || 'sandbox';

    const baseUrl = env === 'production'
      ? 'https://www.melhorenvio.com.br'
      : 'https://sandbox.melhorenvio.com.br';

    if (!clientId || !clientSecret) {
      throw new Error('Client ID e Client Secret do Melhor Envio são obrigatórios. Configure nas Configurações.');
    }

    // ─── GET AUTH URL ───
    if (action === 'get_auth_url') {
      const redirectUri = body.redirect_uri;
      if (!redirectUri) throw new Error('redirect_uri é obrigatório');

      const authUrl = `${baseUrl}/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=cart-read cart-write companies-read companies-write coupons-read coupons-write notifications-read orders-read ecommerce-shipping shipping-calculate shipping-cancel shipping-checkout shipping-companies shipping-generate shipping-preview shipping-print shipping-share shipping-tracking store-read store-write transactions-read users-read users-write webhooks-read webhooks-write`;

      return new Response(JSON.stringify({ auth_url: authUrl }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── EXCHANGE CODE FOR TOKENS ───
    if (action === 'exchange_code') {
      const code = body.code;
      const redirectUri = body.redirect_uri;
      if (!code) throw new Error('code é obrigatório');
      if (!redirectUri) throw new Error('redirect_uri é obrigatório');

      console.log('[OAuth] Exchanging code for tokens...');
      const tokenRes = await fetch(`${baseUrl}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'LibertyPharma (libertyluminaepharma@gmail.com)',
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code,
        }),
      });

      const tokenText = await tokenRes.text();
      console.log(`[OAuth] Token response [${tokenRes.status}]: ${tokenText}`);

      if (!tokenRes.ok) {
        throw new Error(`Erro ao trocar código: ${tokenText}`);
      }

      const tokenData = JSON.parse(tokenText);
      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token;
      const expiresIn = tokenData.expires_in; // seconds
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      // Save tokens
      await Promise.all([
        upsertSetting(supabase, 'melhor_envio_token', accessToken, userId),
        upsertSetting(supabase, 'melhor_envio_refresh_token', refreshToken, userId),
        upsertSetting(supabase, 'melhor_envio_token_expires_at', expiresAt, userId),
      ]);

      console.log(`[OAuth] Tokens saved. Expires at: ${expiresAt}`);

      return new Response(JSON.stringify({
        success: true,
        message: 'Token obtido com sucesso!',
        expires_at: expiresAt,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── REFRESH TOKEN ───
    if (action === 'refresh_token') {
      const refreshToken = await getSetting(supabase, 'melhor_envio_refresh_token');
      if (!refreshToken) {
        throw new Error('Refresh token não encontrado. Reconecte com o Melhor Envio.');
      }

      console.log('[OAuth] Refreshing token...');
      const tokenRes = await fetch(`${baseUrl}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'LibertyPharma (libertyluminaepharma@gmail.com)',
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
        }),
      });

      const tokenText = await tokenRes.text();
      console.log(`[OAuth] Refresh response [${tokenRes.status}]: ${tokenText}`);

      if (!tokenRes.ok) {
        throw new Error(`Erro ao renovar token: ${tokenText}`);
      }

      const tokenData = JSON.parse(tokenText);
      const newAccessToken = tokenData.access_token;
      const newRefreshToken = tokenData.refresh_token;
      const expiresIn = tokenData.expires_in;
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      await Promise.all([
        upsertSetting(supabase, 'melhor_envio_token', newAccessToken, userId),
        upsertSetting(supabase, 'melhor_envio_refresh_token', newRefreshToken, userId),
        upsertSetting(supabase, 'melhor_envio_token_expires_at', expiresAt, userId),
      ]);

      console.log(`[OAuth] Token refreshed. New expiry: ${expiresAt}`);

      return new Response(JSON.stringify({
        success: true,
        message: 'Token renovado com sucesso!',
        expires_at: expiresAt,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Ação desconhecida: ${action}`);
  } catch (error: any) {
    console.error('[OAuth] Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
