import { useEffect, useState } from 'react';
import { Outlet, Navigate, Link } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AdminSidebar } from '@/components/AdminSidebar';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';
import logoImg from '@/assets/liberty-pharma-logo.png';
import { Loader2, ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';

const AdminLayout = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleChecked, setRoleChecked] = useState(false);

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
          <header className="h-14 flex items-center justify-between border-b border-border/50 bg-card px-3 sm:px-4 fixed top-0 right-0 left-0 md:left-[var(--sidebar-width)] z-40 transition-[left] duration-200 ease-linear group-data-[state=collapsed]/sidebar-wrapper:md:left-[--sidebar-width-icon]">
            <Link to="/admin" className="flex items-center gap-2">
              <img src={logoImg} alt="Liberty Pharma" className="h-7 sm:h-8 object-contain" />
            </Link>
            <SidebarTrigger />
          </header>
          <main className="flex-1 p-3 sm:p-6 overflow-x-auto min-w-0 mt-14">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AdminLayout;
