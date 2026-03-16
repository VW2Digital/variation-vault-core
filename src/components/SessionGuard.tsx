import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * Component that monitors auth state and handles expired sessions
 * by signing out and redirecting to the appropriate login page.
 */
export const SessionGuard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          const path = location.pathname;
          if (path.startsWith('/admin')) {
            toast({
              title: 'Sessão expirada',
              description: 'Faça login novamente para continuar.',
              variant: 'destructive',
            });
            navigate('/login', { replace: true });
          } else if (path.startsWith('/minha-conta')) {
            toast({
              title: 'Sessão expirada',
              description: 'Faça login novamente para continuar.',
              variant: 'destructive',
            });
            navigate('/cliente/login', { replace: true });
          }
        }
      }
    );

    // Check on mount if there's a stale session that can't be refreshed
    const checkSession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || (!session && (location.pathname.startsWith('/admin') || location.pathname.startsWith('/minha-conta')))) {
        // Force sign out to clear stale tokens from storage
        await supabase.auth.signOut();
      }
    };
    checkSession();

    return () => subscription.unsubscribe();
  }, [navigate, location.pathname, toast]);

  return null;
};
