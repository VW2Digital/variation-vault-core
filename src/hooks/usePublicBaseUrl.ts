import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Domínios "internos" do Lovable que NUNCA devem ser usados como URL pública
 * para webhooks ou OAuth redirect — gateways externos (Melhor Envio, Stripe,
 * Asaas, etc.) bloqueiam ou rejeitam essas URLs.
 */
const INTERNAL_HOSTS = [
  'lovableproject.com',
  'lovable.app',
  'lovable.dev',
  'localhost',
  '127.0.0.1',
];

const isInternalHost = (host: string) =>
  INTERNAL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));

const stripTrailingSlash = (s: string) => s.replace(/\/+$/, '');

/**
 * Retorna a URL pública canônica da loja, na ordem de prioridade:
 *   1. site_settings.public_site_url (configurada pelo admin — sempre vence)
 *   2. window.location.origin se NÃO for um host interno do Lovable
 *   3. string vazia (UI deve mostrar aviso para o admin configurar)
 *
 * Use sempre que precisar montar URLs que serão coladas em painéis externos
 * (webhooks, OAuth callbacks, etc.) — nunca use window.location.origin direto.
 */
export const usePublicBaseUrl = () => {
  const browserOrigin =
    typeof window !== 'undefined' ? window.location.origin : '';
  const browserHost =
    typeof window !== 'undefined' ? window.location.hostname : '';
  const browserIsInternal = isInternalHost(browserHost);

  const initial = browserIsInternal ? '' : stripTrailingSlash(browserOrigin);

  const [publicUrl, setPublicUrl] = useState<string>(initial);
  const [configuredByAdmin, setConfiguredByAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'public_site_url')
        .maybeSingle();
      if (cancelled) return;
      const v = (data?.value || '').trim();
      if (v && /^https?:\/\//i.test(v)) {
        setPublicUrl(stripTrailingSlash(v));
        setConfiguredByAdmin(true);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    /** URL pública canônica (ex.: https://store.pharmaliberty.com). Pode ser '' se não configurada. */
    publicUrl,
    /** True se o admin salvou explicitamente em site_settings.public_site_url */
    configuredByAdmin,
    /** True se o navegador atual está num host interno do Lovable (preview) */
    browserIsInternal,
    /** True enquanto carrega o setting do banco */
    loading,
  };
};

export default usePublicBaseUrl;