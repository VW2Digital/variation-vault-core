import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CheckoutAuthGate from './CheckoutAuthGate';

// Mock supabase client
const signUpMock = vi.fn();
const signInMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      signUp: (...args: any[]) => signUpMock(...args),
      signInWithPassword: (...args: any[]) => signInMock(...args),
    },
  },
}));

// Mock toast
const toastMock = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

describe('CheckoutAuthGate - email já cadastrado', () => {
  beforeEach(() => {
    signUpMock.mockReset();
    signInMock.mockReset();
    toastMock.mockReset();
  });

  it('troca para aba de login e pré-preenche o email quando o cadastro retorna identities vazio', async () => {
    // Supabase signals duplicate email by returning user with identities=[]
    signUpMock.mockResolvedValue({
      data: {
        user: { id: 'fake-id', identities: [] },
        session: null,
      },
      error: null,
    });

    const onAuthenticated = vi.fn();
    render(<CheckoutAuthGate onAuthenticated={onAuthenticated} />);

    // Aba "Criar Conta" é a padrão — preencher form
    fireEvent.change(screen.getByLabelText(/Nome completo/i), { target: { value: 'João' } });
    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'duplicado@teste.com' } });
    fireEvent.change(screen.getByLabelText(/Senha/i), { target: { value: 'senha123' } });

    fireEvent.click(screen.getByRole('button', { name: /Criar conta e continuar/i }));

    // Aguarda toast de aviso
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Email já cadastrado',
          variant: 'destructive',
        }),
      );
    });

    // Deve ter trocado para a aba de login com email pré-preenchido
    const loginEmail = await screen.findByLabelText(/^Email$/i) as HTMLInputElement;
    expect(loginEmail.value).toBe('duplicado@teste.com');

    // Botão de login deve estar visível
    expect(screen.getByRole('button', { name: /Entrar e continuar/i })).toBeInTheDocument();

    // Não deve ter autenticado
    expect(onAuthenticated).not.toHaveBeenCalled();
    // Não deve ter tentado signIn (early return)
    expect(signInMock).not.toHaveBeenCalled();
  });

  it('troca para aba de login quando signUp lança erro de duplicado', async () => {
    signUpMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'User already registered' },
    });

    const onAuthenticated = vi.fn();
    render(<CheckoutAuthGate onAuthenticated={onAuthenticated} />);

    fireEvent.change(screen.getByLabelText(/Nome completo/i), { target: { value: 'Maria' } });
    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'existente@teste.com' } });
    fireEvent.change(screen.getByLabelText(/Senha/i), { target: { value: 'senha123' } });

    fireEvent.click(screen.getByRole('button', { name: /Criar conta e continuar/i }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Email já cadastrado',
          variant: 'destructive',
        }),
      );
    });

    const loginEmail = await screen.findByLabelText(/^Email$/i) as HTMLInputElement;
    expect(loginEmail.value).toBe('existente@teste.com');
    expect(onAuthenticated).not.toHaveBeenCalled();
  });
});
