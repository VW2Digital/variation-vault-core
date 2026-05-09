// Shared helper to resolve gateway credentials via the round-robin RPC
// `pick_next_gateway_account`. Falls back to legacy `site_settings` keys when
// no account exists for the requested gateway (back-compat).

export type GatewayKey = 'asaas' | 'mercadopago' | 'pagbank' | 'pagarme';

export interface ResolvedGatewayCredentials {
  accountId: string | null;
  environment: string;
  credentials: Record<string, string>;
}

async function readSetting(supabase: any, key: string): Promise<string> {
  const { data } = await supabase.from('site_settings').select('value').eq('key', key).maybeSingle();
  return (data as { value?: string } | null)?.value || '';
}

async function legacyCredentials(supabase: any, gateway: GatewayKey): Promise<ResolvedGatewayCredentials> {
  if (gateway === 'asaas') {
    const api_key = await readSetting(supabase, 'asaas_api_key');
    const environment = (await readSetting(supabase, 'asaas_environment')) || 'sandbox';
    const webhook_token = await readSetting(supabase, 'asaas_webhook_token');
    return { accountId: null, environment, credentials: { api_key, webhook_token } };
  }
  if (gateway === 'mercadopago') {
    const environment = (await readSetting(supabase, 'mercadopago_environment')) || 'sandbox';
    const access_token =
      (await readSetting(supabase, `mercadopago_access_token_${environment}`)) ||
      (await readSetting(supabase, 'mercadopago_access_token'));
    const public_key =
      (await readSetting(supabase, `mercadopago_public_key_${environment}`)) ||
      (await readSetting(supabase, 'mercadopago_public_key'));
    return { accountId: null, environment, credentials: { access_token, public_key } };
  }
  if (gateway === 'pagbank') {
    const token = await readSetting(supabase, 'pagbank_token');
    const environment = (await readSetting(supabase, 'pagbank_environment')) || 'sandbox';
    const email = await readSetting(supabase, 'pagbank_email');
    return { accountId: null, environment, credentials: { token, email } };
  }
  // pagarme
  const environment = (await readSetting(supabase, 'pagarme_environment')) || 'sandbox';
  const secret_key =
    (await readSetting(supabase, `pagarme_secret_key_${environment}`)) ||
    (await readSetting(supabase, 'pagarme_secret_key'));
  const public_key = await readSetting(supabase, 'pagarme_public_key');
  const webhook_secret = await readSetting(supabase, 'pagarme_webhook_secret');
  return { accountId: null, environment, credentials: { secret_key, public_key, webhook_secret } };
}

/**
 * Resolves credentials for the given gateway using round-robin selection from
 * the `gateway_accounts` table. Updates `last_used_at` server-side via RPC.
 * Falls back to legacy `site_settings` keys when no account is registered.
 */
export async function resolveGatewayCredentials(
  supabase: any,
  gateway: GatewayKey,
): Promise<ResolvedGatewayCredentials> {
  try {
    const { data, error } = await supabase.rpc('pick_next_gateway_account', { _gateway: gateway });
    if (error) {
      console.warn(`[gateway-credentials] RPC error for ${gateway}: ${error.message}. Falling back to site_settings.`);
      return await legacyCredentials(supabase, gateway);
    }
    if (data && data.id) {
      const creds = (data.credentials || {}) as Record<string, string>;
      console.log(`[gateway-credentials] ${gateway} -> account ${data.label || data.id} (env: ${data.environment})`);
      return {
        accountId: data.id as string,
        environment: (data.environment as string) || 'sandbox',
        credentials: creds,
      };
    }
  } catch (e) {
    console.warn(`[gateway-credentials] Exception for ${gateway}:`, (e as Error).message);
  }
  return await legacyCredentials(supabase, gateway);
}