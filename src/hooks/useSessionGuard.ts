import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

/**
 * Listens for auth state changes and redirects to login
 * when the session expires or refresh token becomes invalid.
 */
export const useSessionGuard = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED') return;
      if (event === 'SIGNED_OUT') {
        // If the user was on an admin or authenticated route, redirect to login
        const path = window.location.pathname;
        if (path.startsWith('/admin')) {
          navigate('/login', { replace: true });
        } else if (path.startsWith('/minha-conta')) {
          navigate('/cliente/login', { replace: true });
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);
};
