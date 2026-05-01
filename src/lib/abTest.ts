import { supabase } from '@/integrations/supabase/client';

/**
 * A/B test do card do catálogo:
 *   A = layout anterior (discreto, outline pequeno)
 *   B = conversão agressiva (badges grandes, CTA destacado)
 *
 * - Persistência: localStorage por sessionId (estável por dispositivo/navegador)
 * - Distribuição: 50/50 determinística via hash do sessionId
 * - Override manual: ?ab=A | ?ab=B na URL (útil para QA)
 * - Desligar: ?ab=off (força A e não loga)
 */

const STORAGE_SESSION = 'ab_session_id';
const STORAGE_VARIANT = 'ab_card_variant';

export type AbVariant = 'A' | 'B';

function getOrCreateSessionId(): string {
  try {
    let id = localStorage.getItem(STORAGE_SESSION);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(STORAGE_SESSION, id);
    }
    return id;
  } catch {
    return 'anon-' + Math.random().toString(36).slice(2);
  }
}

function pickVariant(sessionId: string): AbVariant {
  // Hash simples, determinístico
  let h = 0;
  for (let i = 0; i < sessionId.length; i++) {
    h = (h * 31 + sessionId.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 2 === 0 ? 'A' : 'B';
}

export function getAbContext(): {
  variant: AbVariant;
  sessionId: string;
  enabled: boolean;
} {
  const sessionId = getOrCreateSessionId();

  // Override via URL
  let override: string | null = null;
  try {
    const params = new URLSearchParams(window.location.search);
    override = params.get('ab');
  } catch {}

  if (override === 'off') {
    return { variant: 'A', sessionId, enabled: false };
  }
  if (override === 'A' || override === 'B') {
    try {
      localStorage.setItem(STORAGE_VARIANT, override);
    } catch {}
    return { variant: override, sessionId, enabled: true };
  }

  let variant: AbVariant;
  try {
    const stored = localStorage.getItem(STORAGE_VARIANT) as AbVariant | null;
    if (stored === 'A' || stored === 'B') {
      variant = stored;
    } else {
      variant = pickVariant(sessionId);
      localStorage.setItem(STORAGE_VARIANT, variant);
    }
  } catch {
    variant = pickVariant(sessionId);
  }

  return { variant, sessionId, enabled: true };
}

/**
 * Registra um evento. Fire-and-forget; nunca bloqueia UI.
 * Deduplicação de impressões fica do lado do componente (Set por sessão).
 */
export async function trackAbEvent(
  variant: AbVariant,
  eventType: 'impression' | 'cta_click',
  productId: string | null,
  variationId: string | null,
  enabled: boolean,
) {
  if (!enabled) return;
  try {
    const sessionId = getOrCreateSessionId();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('ab_card_events').insert({
      variant,
      event_type: eventType,
      product_id: productId,
      variation_id: variationId,
      session_id: sessionId,
      user_id: user?.id ?? null,
    });
  } catch {
    // silencioso: telemetria nunca pode quebrar a UI
  }
}