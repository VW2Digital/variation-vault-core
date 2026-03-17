import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useCart } from '@/contexts/CartContext';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { ShoppingCart, User, Menu, LogOut, Package, Home, ChevronRight } from 'lucide-react';
import logoImg from '@/assets/liberty-pharma-logo.png';
import LanguageSwitcher from '@/components/LanguageSwitcher';

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { totalItems } = useCart();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setIsLoggedIn(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setMobileOpen(false);
    navigate('/cliente/login');
  };

  const isActive = (path: string) => location.pathname === path;

  const navLinks = [
    { to: '/catalogo', label: 'Catálogo', icon: Home },
    { to: '/carrinho', label: 'Carrinho', icon: ShoppingCart },
    ...(isLoggedIn
      ? [{ to: '/minha-conta', label: 'Minha Conta', icon: User }]
      : [{ to: '/cliente/login', label: 'Entrar', icon: User }]),
  ];

  return (
    <>
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-card/95 backdrop-blur-md shadow-sm border-b border-border/30' : 'bg-card border-b border-border/50'}`}>
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/catalogo" className="flex items-center gap-2 shrink-0 group">
            <img src={logoImg} alt="Liberty Pharma" className="h-9 md:h-11 object-contain transition-transform group-hover:scale-105" />
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            <Link
              to="/catalogo"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${isActive('/catalogo') || isActive('/') ? 'text-primary bg-primary/10' : 'text-foreground hover:text-primary hover:bg-muted/50'}`}
            >
              Catálogo
            </Link>

            <Link to="/carrinho" className="relative p-2.5 rounded-lg text-foreground hover:text-primary hover:bg-muted/50 transition-all">
              <ShoppingCart className="w-5 h-5" />
              {totalItems > 0 && (
                <span className="absolute top-1 right-0.5 bg-primary text-primary-foreground text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 animate-in zoom-in-50 duration-200">
                  {totalItems}
                </span>
              )}
            </Link>

            <div className="w-px h-6 bg-border/60 mx-1" />

            {isLoggedIn ? (
              <>
                <Link to="/minha-conta">
                  <Button
                    variant={isActive('/minha-conta') ? 'default' : 'ghost'}
                    size="sm"
                    className="gap-1.5"
                  >
                    <User className="w-4 h-4" /> Minha Conta
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                  <LogOut className="w-4 h-4" /> Sair
                </Button>
              </>
            ) : (
              <Link to="/cliente/login">
                <Button variant="default" size="sm" className="gap-1.5">
                  <User className="w-4 h-4" /> Entrar
                </Button>
              </Link>
            )}

            <div className="w-px h-6 bg-border/60 mx-1" />
            <LanguageSwitcher />
          </nav>

          {/* Mobile: cart + hamburger */}
          <div className="flex md:hidden items-center gap-2">
            <Link to="/carrinho" className="relative p-2 text-foreground rounded-lg hover:bg-muted/50 transition-colors">
              <ShoppingCart className="w-5 h-5" />
              {totalItems > 0 && (
                <span className="absolute top-0.5 right-0 bg-primary text-primary-foreground text-[10px] font-bold min-w-[16px] h-[16px] rounded-full flex items-center justify-center px-0.5 animate-in zoom-in-50 duration-200">
                  {totalItems}
                </span>
              )}
            </Link>
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px] p-0 bg-card">
                <div className="p-5 border-b border-border/30 bg-gradient-to-r from-primary/5 to-transparent">
                  <img src={logoImg} alt="Liberty Pharma" className="h-9 object-contain" />
                </div>
                <nav className="flex flex-col p-3 gap-0.5">
                  {navLinks.map((link) => (
                    <Link
                      key={link.to}
                      to={link.to}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                        isActive(link.to)
                          ? 'bg-primary/10 text-primary'
                          : 'text-foreground hover:bg-muted/60'
                      }`}
                    >
                      <link.icon className={`w-4.5 h-4.5 ${isActive(link.to) ? 'text-primary' : 'text-muted-foreground'}`} />
                      {link.label}
                      {link.to === '/carrinho' && totalItems > 0 && (
                        <span className="ml-auto bg-primary text-primary-foreground text-[10px] font-bold min-w-[20px] h-5 rounded-full flex items-center justify-center px-1">
                          {totalItems}
                        </span>
                      )}
                      {link.to !== '/carrinho' && (
                        <ChevronRight className="w-4 h-4 ml-auto text-muted-foreground/40" />
                      )}
                    </Link>
                  ))}
                  {isLoggedIn && (
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-3 px-4 py-3 rounded-lg text-destructive hover:bg-destructive/10 transition-all text-sm font-medium mt-3 border-t border-border/30 pt-4"
                    >
                      <LogOut className="w-4 h-4" />
                      Sair
                    </button>
                  )}
                  <div className="border-t border-border/30 mt-3 pt-4 px-3">
                    <LanguageSwitcher />
                  </div>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
    <div className="h-16" /> {/* Spacer for fixed header */}
    </>
  );
};

export default Header;
