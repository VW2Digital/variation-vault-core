import { useState } from 'react';
import { signIn } from '@/lib/api';
import { useNavigate, Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ShieldCheck, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import logoImg from '@/assets/liberty-pharma-logo.png';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(email, password);
      navigate('/admin');
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.message || 'Email ou senha incorretos.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });
      if (error) throw error;
      toast({
        title: 'Email enviado',
        description: 'Verifique sua caixa de entrada para redefinir sua senha.',
      });
      setForgotMode(false);
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.message || 'Não foi possível enviar o email.',
        variant: 'destructive',
      });
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border/50 bg-card">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <img src={logoImg} alt="Liberty Pharma" className="h-10 object-contain" />
          </Link>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg border-border/50">
          <CardHeader className="text-center space-y-4 pb-2">
            <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {forgotMode ? 'Redefinir Senha' : 'Painel Administrativo'}
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                {forgotMode
                  ? 'Informe seu email para receber o link de recuperação'
                  : 'Faça login para gerenciar seus produtos'}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {forgotMode ? (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="forgot-email">Email</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={forgotLoading}>
                  {forgotLoading ? 'Enviando...' : 'Enviar link de recuperação'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setForgotMode(false)}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Voltar ao login
                </Button>
              </form>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Carregando...' : 'Entrar'}
                </Button>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setForgotMode(true)}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    Esqueceu a senha?
                  </button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Login;
