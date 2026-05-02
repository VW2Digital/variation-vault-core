import { useEffect, useState } from 'react';
import { Outlet, Navigate, Link, useNavigate } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AdminSidebar } from '@/components/AdminSidebar';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';

import { Loader2, ShieldX, Search, Plus, Bell, MessageCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import iconImg from '@/assets/liberty-pharma-icon.png';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

const AdminLayout = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleChecked, setRoleChecked] = useState(false);
  const [adminName, setAdminName] = useState<string>('');
  const [search, setSearch] = useState('');
  const navigateInstance = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setLoading(false);
        setRoleChecked(true);
        setIsAdmin(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setLoading(false);
        setRoleChecked(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Check admin role when user changes
  useEffect(() => {
    if (!user) return;
    const checkRole = async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();
      
      setIsAdmin(!!data && !error);
      setRoleChecked(true);
      setLoading(false);
    };
    checkRole();
  }, [user]);

  // Carrega nome do admin para a saudação
  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('full_name').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        const fn = (data as any)?.full_name || user.email?.split('@')[0] || 'Admin';
        setAdminName(String(fn).split(' ')[0]);
      });
  }, [user]);

  // Atalhos de criação rápida
  const quickCreateOptions = [
    { label: 'Novo Produto', path: '/admin/produtos' },
    { label: 'Novo Cupom', path: '/admin/cupons' },
    { label: 'Link de Pagamento', path: '/admin/links-pagamento' },
    { label: 'Disparo de E-mail', path: '/admin/disparo-emails' },
    { label: 'Banner', path: '/admin/banners' },
  ];

  // Busca: redireciona para a tela mais provável conforme o termo
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    const lower = q.toLowerCase();
    if (/pedido|order|#?\d{4,}/.test(lower)) {
      navigateInstance(`/admin/pedidos?busca=${encodeURIComponent(q)}`);
    } else if (/cupom|cupon|coupon/.test(lower)) {
      navigateInstance('/admin/cupons');
    } else if (/cliente|user|usuario|usuário/.test(lower)) {
      navigateInstance(`/admin/usuarios?busca=${encodeURIComponent(q)}`);
    } else {
      navigateInstance(`/admin/produtos?busca=${encodeURIComponent(q)}`);
    }
  };

  if (loading || !roleChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4 max-w-md">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldX className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Acesso Negado</h1>
          <p className="text-muted-foreground">
            Você não tem permissão para acessar o painel administrativo.
          </p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); }}>
              Sair
            </Button>
            <Link to="/catalogo">
              <Button>Ir para o Catálogo</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full overflow-x-hidden">
        <AdminSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 flex items-center gap-2 sm:gap-3 border-b border-border/50 bg-card/80 backdrop-blur-xl px-3 sm:px-5 fixed top-0 right-0 left-0 md:left-[var(--sidebar-width)] z-40 transition-[left] duration-200 ease-linear group-data-[state=collapsed]/sidebar-wrapper:md:left-[--sidebar-width-icon]">
            {/* Esquerda: trigger */}
            <div className="flex items-center gap-2 shrink-0">
              <SidebarTrigger className="hidden md:inline-flex" />
            </div>

            {/* Centro: busca global (desktop) */}
            <form onSubmit={handleSearchSubmit} className="hidden md:flex flex-1 max-w-xl mx-auto">
              <div className="relative w-full">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar pedidos, produtos, clientes, cupons..."
                  className="pl-10 h-10 bg-muted/40 border-transparent focus-visible:bg-background rounded-full text-sm"
                />
              </div>
            </form>

            {/* Direita: ações + perfil */}
            <div className="ml-auto flex items-center gap-1.5 sm:gap-2 shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    className="hidden sm:inline-flex rounded-full h-9 px-4 gap-1.5 bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-95 shadow-md shadow-primary/25 border-0"
                  >
                    <Plus className="h-4 w-4" />
                    <span className="text-xs font-semibold">Criar novo</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel className="text-xs">Atalhos</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {quickCreateOptions.map((opt) => (
                    <DropdownMenuItem
                      key={opt.path}
                      onClick={() => navigateInstance(opt.path)}
                      className="text-sm"
                    >
                      {opt.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="ghost"
                size="icon"
                className="rounded-full h-9 w-9 hidden sm:inline-flex"
                onClick={() => navigateInstance('/admin/falhas-pagamento')}
                title="Falhas de pagamento"
              >
                <Bell className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full h-9 w-9 hidden sm:inline-flex"
                onClick={() => navigateInstance('/admin/suporte')}
                title="Suporte"
              >
                <MessageCircle className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="rounded-full h-9 w-9 hidden sm:inline-flex"
                onClick={() => window.open('/', '_blank', 'noopener,noreferrer')}
                title="Abrir catálogo em nova aba"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>

              {/* Avatar / saudação */}
              <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-border/40 ml-1">
                <div className="w-9 h-9 rounded-full bg-background border border-border/40 flex items-center justify-center overflow-hidden">
                  <img src={iconImg} alt="Liberty Pharma" className="w-7 h-7 object-contain" />
                </div>
                <div className="leading-tight">
                  <p className="text-[11px] text-muted-foreground">Olá,</p>
                  <p className="text-xs font-semibold text-foreground -mt-0.5">{adminName || 'Admin'}</p>
                </div>
              </div>

              <SidebarTrigger className="md:hidden" />
            </div>
          </header>

          <main className="flex-1 p-3 sm:p-6 overflow-x-auto min-w-0 mt-16 bg-gradient-to-b from-background via-background to-primary/[0.02]">
            <div className="mx-auto w-full max-w-[1600px] space-y-5">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AdminLayout;
