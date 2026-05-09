import { supabase } from '@/integrations/supabase/client';

export type GatewayKey = 'asaas' | 'mercadopago' | 'pagbank' | 'pagarme';

export interface GatewayAccount {
  id: string;
  gateway: GatewayKey;
  label: string;
  environment: 'sandbox' | 'production';
  credentials: Record<string, string>;
  active: boolean;
  is_primary: boolean;
  sort_order: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Field schema per gateway used by the dynamic add/edit form. */
export interface GatewayFieldSpec {
  key: string;
  label: string;
  type: 'text' | 'password' | 'select';
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  helpText?: string;
}

export const GATEWAY_FIELDS: Record<GatewayKey, GatewayFieldSpec[]> = {
  asaas: [
    { key: 'api_key', label: 'API Key', type: 'password', placeholder: '$aact_...', required: true },
    { key: 'webhook_token', label: 'Token de Autenticação do Webhook', type: 'password', placeholder: 'Token definido no Asaas' },
  ],
  mercadopago: [
    { key: 'access_token', label: 'Access Token', type: 'password', placeholder: 'APP_USR-... ou TEST-...', required: true },
    { key: 'public_key', label: 'Public Key', type: 'text', placeholder: 'APP_USR-... ou TEST-...', required: true },
    { key: 'webhook_secret', label: 'Webhook Secret', type: 'password', placeholder: 'Assinatura HMAC do MP' },
  ],
  pagbank: [
    { key: 'token', label: 'Token de Integração', type: 'password', placeholder: 'Token do PagBank', required: true },
    { key: 'email', label: 'E-mail da conta PagBank', type: 'text', placeholder: 'email@dominio.com' },
  ],
  pagarme: [
    { key: 'secret_key', label: 'Secret Key', type: 'password', placeholder: 'sk_test_... ou sk_live_...', required: true },
    { key: 'public_key', label: 'Public Key', type: 'text', placeholder: 'pk_test_... ou pk_live_...' },
    { key: 'webhook_secret', label: 'Webhook Secret (HMAC-SHA1)', type: 'password' },
  ],
};

export async function listGatewayAccounts(gateway?: GatewayKey): Promise<GatewayAccount[]> {
  let query = supabase.from('gateway_accounts' as never).select('*').order('sort_order').order('created_at');
  if (gateway) query = (query as any).eq('gateway', gateway);
  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as GatewayAccount[]) ?? [];
}

export async function createGatewayAccount(payload: {
  gateway: GatewayKey;
  label: string;
  environment: 'sandbox' | 'production';
  credentials: Record<string, string>;
  is_primary?: boolean;
  active?: boolean;
}): Promise<GatewayAccount> {
  // If marking as primary, demote previous primary for the same gateway first.
  if (payload.is_primary) {
    await (supabase.from('gateway_accounts' as never) as any)
      .update({ is_primary: false })
      .eq('gateway', payload.gateway)
      .eq('is_primary', true);
  }
  const { data, error } = await (supabase.from('gateway_accounts' as never) as any)
    .insert({
      gateway: payload.gateway,
      label: payload.label,
      environment: payload.environment,
      credentials: payload.credentials,
      is_primary: payload.is_primary ?? false,
      active: payload.active ?? true,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as GatewayAccount;
}

export async function updateGatewayAccount(id: string, patch: Partial<Omit<GatewayAccount, 'id' | 'created_at' | 'updated_at' | 'gateway'>>): Promise<void> {
  const { error } = await (supabase.from('gateway_accounts' as never) as any).update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteGatewayAccount(id: string): Promise<void> {
  const { error } = await (supabase.from('gateway_accounts' as never) as any).delete().eq('id', id);
  if (error) throw error;
}

export async function setPrimaryAccount(id: string, gateway: GatewayKey): Promise<void> {
  await (supabase.from('gateway_accounts' as never) as any)
    .update({ is_primary: false })
    .eq('gateway', gateway)
    .eq('is_primary', true);
  await updateGatewayAccount(id, { is_primary: true, active: true });
}