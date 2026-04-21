import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// --- Mock supabase ---
let authChangeCb: ((event: string, session: any) => void) | null = null;
const getSessionMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: () => getSessionMock(),
      onAuthStateChange: (cb: (event: string, session: any) => void) => {
        authChangeCb = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
    from: (...args: any[]) => fromMock(...args),
  },
}));

// --- Mock cart ---
const mockItems = [{
  id: 'ci1',
  product_id: 'p1',
  variation_id: 'v1',
  quantity: 1,
  product_name: 'Produto Teste',
  dosage: '5mg',
  price: 100,
  original_price: 100,
  is_offer: false,
  image_url: '',
  in_stock: true,
  wholesale_prices: [],
}];
vi.mock('@/contexts/CartContext', () => ({
  useCart: () => ({
    items: mockItems,
    totalPrice: 100,
    clearCart: vi.fn(),
    loading: false,
  }),
  getEffectivePrice: (p: number) => p,
}));

// --- Mock heavy children ---
vi.mock('@/components/Header', () => ({ default: () => <div data-testid="header" /> }));
vi.mock('@/components/Footer', () => ({ default: () => <div data-testid="footer" /> }));
vi.mock('@/components/UpsellSection', () => ({ default: () => <div data-testid="upsell" /> }));
vi.mock('@/components/AnimatedSection', () => ({
  AnimatedSection: ({ children }: any) => <div>{children}</div>,
}));
vi.mock('@/components/CheckoutForm', () => ({
  default: () => <div data-testid="checkout-form">Fluxo de pagamento</div>,
}));
vi.mock('@/components/CheckoutAuthGate', () => ({
  default: ({ onAuthenticated }: any) => (
    <div data-testid="auth-gate">
      <button onClick={() => onAuthenticated()}>simulate-login</button>
    </div>
  ),
}));
vi.mock('@/lib/gtag', () => ({ gtagBeginCheckout: vi.fn() }));
vi.mock('@/lib/fbPixel', () => ({ fbInitiateCheckout: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import CartCheckout from './CartCheckout';

describe('CartCheckout - autenticação preserva o usuário no checkout', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    fromMock.mockReset();
    authChangeCb = null;
    // products query returns empty -> no inactive products, no shipping update
    fromMock.mockReturnValue({
      select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }),
    });
  });

  it('mostra o gate quando deslogado e troca para o fluxo de pagamento após onAuthenticated', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });

    render(
      <MemoryRouter initialEntries={['/checkout-carrinho']}>
        <CartCheckout />
      </MemoryRouter>,
    );

    // Aguarda gate renderizar
    const gate = await screen.findByTestId('auth-gate');
    expect(gate).toBeInTheDocument();
    expect(screen.queryByTestId('checkout-form')).not.toBeInTheDocument();

    // Simula login bem-sucedido via callback do gate
    await act(async () => {
      screen.getByText('simulate-login').click();
    });

    // Form de pagamento deve aparecer (mesma rota, sem redirect)
    await waitFor(() => {
      expect(screen.getByTestId('checkout-form')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('auth-gate')).not.toBeInTheDocument();
  });

  it('renderiza direto o fluxo de pagamento quando já autenticado', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'tok', user: { id: 'u1' } } },
    });

    render(
      <MemoryRouter initialEntries={['/checkout-carrinho']}>
        <CartCheckout />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('checkout-form')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('auth-gate')).not.toBeInTheDocument();
  });
});
