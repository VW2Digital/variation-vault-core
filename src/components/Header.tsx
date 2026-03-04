import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useCart } from '@/contexts/CartContext';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { ShoppingCart, User, Menu, LogOut, Package, Home } from 'lucide-react';
import logoImg from '@/assets/liberty-pharma-logo.png';

const Header = () => {
  const navigate = useNavigate();
  const { totalItems } = useCart();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setIsLoggedIn(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setMobileOpen(false);
    navigate('/cliente/login');
  };

  const navLinks = [
    { to: '/catalogo', label: 'Catálogo', icon: Home },
    { to: '/carrinho', label: 'Carrinho', icon: ShoppingCart },
    ...(isLoggedIn
      ? [{ to: '/minha-conta', label: 'Minha Conta', icon: User }]
      : [{ to: '/cliente/login', label: 'Entrar', icon: User }]),
  ];

  return (
    <header className="border-b border-border/50 bg-card sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo */}
        <Link to="/catalogo" className="flex items-center gap-2">
          <img src={logoImg} alt="Liberty Pharma" className="h-10 object-contain" />
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-4 text-sm">
          <Link to="/catalogo" className="text-foreground font-medium hover:text-primary transition-colors">
            Catálogo
          </Link>
          <Link to="/carrinho" className="relative text-foreground hover:text-primary transition-colors">
            <ShoppingCart className="w-5 h-5" />
            {totalItems > 0 && (
              <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {totalItems}
              </span>
            )}
          </Link>
          {isLoggedIn ? (
            <>
              <Link to="/minha-conta">
                <Button variant="ghost" size="sm" className="gap-1">
                  <User className="w-4 h-4" /> Minha Conta
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={handleLogout} className="gap-1">
                <LogOut className="w-4 h-4" /> Sair
              </Button>
            </>
          ) : (
            <Link to="/cliente/login">
              <Button variant="outline" size="sm" className="gap-1">
                <User className="w-4 h-4" /> Entrar
              </Button>
            </Link>
          )}
        </nav>

        {/* Mobile: cart + hamburger */}
        <div className="flex md:hidden items-center gap-2">
          <Link to="/carrinho" className="relative text-foreground">
            <ShoppingCart className="w-5 h-5" />
            {totalItems > 0 && (
              <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {totalItems}
              </span>
            )}
          </Link>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[260px] p-0">
              <div className="p-6 border-b border-border/50">
                <img src={logoImg} alt="Liberty Pharma" className="h-8 object-contain" />
              </div>
              <nav className="flex flex-col p-4 gap-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg text-foreground hover:bg-muted transition-colors text-sm font-medium"
                  >
                    <link.icon className="w-4 h-4 text-muted-foreground" />
                    {link.label}
                    {link.to === '/carrinho' && totalItems > 0 && (
                      <span className="ml-auto bg-primary text-primary-foreground text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                        {totalItems}
                      </span>
                    )}
                  </Link>
                ))}
                {isLoggedIn && (
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg text-destructive hover:bg-destructive/10 transition-colors text-sm font-medium mt-2 border-t border-border/50 pt-4"
                  >
                    <LogOut className="w-4 h-4" />
                    Sair
                  </button>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};

export default Header;
