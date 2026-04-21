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

describe('CheckoutAuthGate - autenticação bem-sucedida mantém usuário no checkout', () => {
  beforeEach(() => {
    signUpMock.mockReset();
    signInMock.mockReset();
    toastMock.mockReset();
  });

  it('chama onAuthenticated após login bem-sucedido (sem redirecionar para fora do checkout)', async () => {
    signInMock.mockResolvedValue({
      data: { user: { id: 'user-1' }, session: { access_token: 'tok' } },
      error: null,
    });

    const onAuthenticated = vi.fn();
    render(<CheckoutAuthGate onAuthenticated={onAuthenticated} />);

    // Trocar para aba de login (Radix Tabs)
    const loginTab = screen.getByRole('tab', { name: /Já sou cliente/i });
    fireEvent.pointerDown(loginTab, { button: 0, ctrlKey: false });
    fireEvent.mouseDown(loginTab, { button: 0 });
    fireEvent.click(loginTab);

    const loginEmailInput = await screen.findByLabelText(/^Email$/i);
    const loginPasswordInput = await screen.findByLabelText(/Senha/i);
    fireEvent.change(loginEmailInput, { target: { value: 'cliente@teste.com' } });
    fireEvent.change(loginPasswordInput, { target: { value: 'senha123' } });

    const loginButton = await screen.findByRole('button', { name: /Entrar e continuar/i });
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith({
        email: 'cliente@teste.com',
        password: 'senha123',
      });
    });

    // Callback deve ser disparado para o CartCheckout liberar o CheckoutForm
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledTimes(1));
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Login realizado!' }),
    );
  });

  it('chama onAuthenticated quando o cadastro retorna sessão imediata', async () => {
    signUpMock.mockResolvedValue({
      data: {
        user: { id: 'new-user', identities: [{ id: 'i1' }] },
        session: { access_token: 'tok' },
      },
      error: null,
    });

    const onAuthenticated = vi.fn();
    render(<CheckoutAuthGate onAuthenticated={onAuthenticated} />);

    fireEvent.change(screen.getByLabelText(/Nome completo/i), { target: { value: 'Novo Cliente' } });
    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'novo@teste.com' } });
    fireEvent.change(screen.getByLabelText(/Senha/i), { target: { value: 'senha123' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar conta e continuar/i }));

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledTimes(1));
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Conta criada!' }),
    );
    // Não deve ter tentado signIn extra (early return ao detectar sessão)
    expect(signInMock).not.toHaveBeenCalled();
  });
});
