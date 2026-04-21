import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, Eye, EyeOff, ShieldCheck, UserPlus, LogIn } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Props {
  onAuthenticated: () => void;
}

const CheckoutAuthGate = ({ onAuthenticated }: Props) => {
  const { toast } = useToast();
  const [tab, setTab] = useState<'login' | 'signup'>('signup');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Signup fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });
      if (error) throw error;
      toast({ title: 'Login realizado!', description: 'Continue sua compra.' });
      onAuthenticated();
    } catch (err: any) {
      toast({
        title: 'Erro ao entrar',
        description: err.message || 'Email ou senha incorretos.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({
        title: 'Senha muito curta',
        description: 'A senha deve ter pelo menos 6 caracteres.',
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name, role: 'customer' },
          emailRedirectTo: window.location.origin + '/checkout-carrinho',
        },
      });
      if (error) throw error;

      // If session is returned (auto-confirm enabled), proceed
      if (data.session) {
        toast({ title: 'Conta criada!', description: 'Continue sua compra.' });
        onAuthenticated();
      } else {
        // Detect "email already in use": Supabase returns user with empty identities array
        const identities = (data.user as any)?.identities;
        if (data.user && Array.isArray(identities) && identities.length === 0) {
          toast({
            title: 'Email já cadastrado',
            description: 'Este email já possui uma conta. Faça login para continuar.',
            variant: 'destructive',
          });
          setTab('login');
          setLoginEmail(email);
          return;
        }
        // Try to sign in immediately (in case email confirmation is required but already trusted)
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (!signInError) {
          toast({ title: 'Conta criada!', description: 'Continue sua compra.' });
          onAuthenticated();
        } else {
          toast({
            title: 'Confirme seu email',
            description: 'Enviamos um link de confirmação para ' + email + '. Após confirmar, faça login para finalizar.',
          });
          setTab('login');
          setLoginEmail(email);
        }
      }
    } catch (err: any) {
      const msg = (err.message || '').toLowerCase();
      const isDuplicate =
        msg.includes('already registered') ||
        msg.includes('already exists') ||
        msg.includes('user already') ||
        msg.includes('duplicate');
      if (isDuplicate) {
        toast({
          title: 'Email já cadastrado',
          description: 'Este email já possui uma conta. Faça login para continuar.',
          variant: 'destructive',
        });
        setTab('login');
        setLoginEmail(email);
      } else {
        toast({
          title: 'Erro ao cadastrar',
          description: err.message || 'Não foi possível criar a conta.',
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-border/50 rounded-xl p-5 bg-card mb-6">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">Identifique-se para finalizar</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Crie uma conta rápida ou entre para concluir seu pedido com segurança.
      </p>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'login' | 'signup')} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="signup" className="gap-2">
            <UserPlus className="w-4 h-4" /> Criar Conta
          </TabsTrigger>
          <TabsTrigger value="login" className="gap-2">
            <LogIn className="w-4 h-4" /> Já sou cliente
          </TabsTrigger>
        </TabsList>

        <TabsContent value="signup" className="mt-4">
          <form onSubmit={handleSignup} className="space-y-3">
            <div>
              <Label htmlFor="signup-name">Nome completo</Label>
              <Input
                id="signup-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Seu nome"
              />
            </div>
            <div>
              <Label htmlFor="signup-email">Email</Label>
              <Input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="seu@email.com"
              />
            </div>
            <div>
              <Label htmlFor="signup-password">Senha</Label>
              <div className="relative">
                <Input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Mínimo 6 caracteres"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Criar conta e continuar'}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="login" className="mt-4">
          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
                placeholder="seu@email.com"
              />
            </div>
            <div>
              <Label htmlFor="login-password">Senha</Label>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  placeholder="Sua senha"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Entrar e continuar'}
            </Button>
            <div className="text-center">
              <a
                href={`/cliente/login?redirect=${encodeURIComponent('/checkout-carrinho')}`}
                className="text-xs text-muted-foreground hover:text-primary"
              >
                Esqueceu a senha?
              </a>
            </div>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CheckoutAuthGate;
