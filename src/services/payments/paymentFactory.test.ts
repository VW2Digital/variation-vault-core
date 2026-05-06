import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api', () => ({
  fetchSetting: vi.fn(),
}));

import { fetchSetting } from '@/lib/api';
import {
  getActiveGateway,
  getGatewayEnvironment,
  isGatewayEnabled,
  isGatewayFallbackEligible,
  getAvailableCardFallbacks,
  CARD_FALLBACK_ORDER,
} from './paymentFactory';

const mockSettings = (map: Record<string, string | null | undefined>) => {
  (fetchSetting as any).mockImplementation((key: string) =>
    Promise.resolve(map[key] ?? '')
  );
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('paymentFactory.getActiveGateway', () => {
  it('returns asaas by default when setting is empty', async () => {
    mockSettings({});
    expect(await getActiveGateway()).toBe('asaas');
  });

  it.each(['mercadopago', 'pagbank', 'pagarme', 'asaas'] as const)(
    'returns %s when configured',
    async (gw) => {
      mockSettings({ payment_gateway: gw });
      expect(await getActiveGateway()).toBe(gw);
    }
  );

  it('falls back to asaas for unknown values', async () => {
    mockSettings({ payment_gateway: 'stripe' });
    expect(await getActiveGateway()).toBe('asaas');
  });
});

describe('paymentFactory.getGatewayEnvironment', () => {
  it('defaults to sandbox for every gateway when unset', async () => {
    mockSettings({});
    for (const gw of ['asaas', 'mercadopago', 'pagbank', 'pagarme'] as const) {
      expect(await getGatewayEnvironment(gw)).toBe('sandbox');
    }
  });

  it('returns production only when explicitly set', async () => {
    mockSettings({
      asaas_environment: 'production',
      mercadopago_environment: 'production',
      pagbank_environment: 'sandbox',
      pagarme_environment: 'production',
    });
    expect(await getGatewayEnvironment('asaas')).toBe('production');
    expect(await getGatewayEnvironment('mercadopago')).toBe('production');
    expect(await getGatewayEnvironment('pagbank')).toBe('sandbox');
    expect(await getGatewayEnvironment('pagarme')).toBe('production');
  });
});

describe('paymentFactory.isGatewayEnabled', () => {
  it('treats missing setting as enabled (backward compatible)', async () => {
    mockSettings({});
    expect(await isGatewayEnabled('asaas')).toBe(true);
  });

  it('returns false only when set to "false"', async () => {
    mockSettings({ asaas_enabled: 'false' });
    expect(await isGatewayEnabled('asaas')).toBe(false);
    mockSettings({ asaas_enabled: 'true' });
    expect(await isGatewayEnabled('asaas')).toBe(true);
  });
});

describe('paymentFactory.isGatewayFallbackEligible', () => {
  it('requires both enabled AND fallback flags', async () => {
    mockSettings({ mercadopago_enabled: 'false', mercadopago_fallback_enabled: 'true' });
    expect(await isGatewayFallbackEligible('mercadopago')).toBe(false);

    mockSettings({ mercadopago_enabled: 'true', mercadopago_fallback_enabled: 'false' });
    expect(await isGatewayFallbackEligible('mercadopago')).toBe(false);

    mockSettings({ mercadopago_enabled: 'true', mercadopago_fallback_enabled: 'true' });
    expect(await isGatewayFallbackEligible('mercadopago')).toBe(true);
  });
});

describe('paymentFactory.getAvailableCardFallbacks', () => {
  it('excludes the current gateway from candidates', async () => {
    mockSettings({
      mercadopago_public_key: 'pk_mp',
      pagarme_public_key: 'pk_pm',
      asaas_environment: 'sandbox',
    });
    const result = await getAvailableCardFallbacks('mercadopago');
    expect(result.find((r) => r.gateway === 'mercadopago')).toBeUndefined();
  });

  it('skips gateways disabled by admin', async () => {
    mockSettings({
      mercadopago_enabled: 'false',
      mercadopago_public_key: 'pk_mp',
      pagarme_public_key: 'pk_pm',
      pagarme_environment: 'sandbox',
    });
    const result = await getAvailableCardFallbacks('asaas');
    expect(result.find((r) => r.gateway === 'mercadopago')).toBeUndefined();
  });

  it('respects admin-configured order from card_fallback_order', async () => {
    mockSettings({
      card_fallback_order: 'pagarme,mercadopago,asaas',
      mercadopago_public_key: 'pk_mp',
      pagarme_public_key: 'pk_pm',
    });
    const result = await getAvailableCardFallbacks('asaas');
    const order = result.map((r) => r.gateway);
    expect(order.indexOf('pagarme')).toBeLessThan(order.indexOf('mercadopago'));
  });

  it('always includes asaas as last-resort fallback when not current', async () => {
    mockSettings({});
    const result = await getAvailableCardFallbacks('mercadopago');
    expect(result.find((r) => r.gateway === 'asaas')).toBeDefined();
  });
});

describe('CARD_FALLBACK_ORDER constant', () => {
  it('has the expected default order without pagbank (redirect-only)', () => {
    expect(CARD_FALLBACK_ORDER).toEqual(['mercadopago', 'pagarme', 'asaas']);
    expect(CARD_FALLBACK_ORDER).not.toContain('pagbank');
  });
});
