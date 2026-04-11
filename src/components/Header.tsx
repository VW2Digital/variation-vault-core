import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useCart } from '@/contexts/CartContext';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ShoppingCart, User, Menu, LogOut, Package, Home, ChevronRight, Search, Headset, ChevronDown, MessageCircle } from 'lucide-react';
import logoImg from '@/assets/liberty-pharma-logo.png';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { fetchSetting } from '@/lib/api';

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { totalItems, totalPrice } = useCart();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');

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

  useEffect(() => {
    fetchSetting('whatsapp_number').then((val) => setWhatsappNumber(val || ''));
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setMobileOpen(false);
    navigate('/cliente/login');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/catalogo?busca=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const isActive = (path: string) => location.pathname === path;

  const navLinks = [
    { to: '/catalogo', label: 'Catálogo', icon: Home },
    { to: '/carrinho', label: 'Carrinho', icon: ShoppingCart },
    ...(isLoggedIn
      ? [{ to: '/minha-conta', label: 'Minha Conta', icon: User }]
      : [{ to: '/cliente/login', label: 'Entrar', icon: User }]),
  ];

  const whatsappUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber.replace(/\D/g, '')}`
    : '#';

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-card/95 backdrop-blur-md shadow-sm border-b border-border/30'
            : 'bg-card border-b border-border/50'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4">
          {/* Desktop Header */}
          <div className="hidden md:flex items-center gap-6 h-[72px]">
            {/* Logo */}
            <Link to="/catalogo" className="flex items-center shrink-0 group">
              <img
                src={logoImg}
                alt="Liberty Pharma"
                className="h-11 object-contain transition-transform group-hover:scale-105"
              />
            </Link>

            {/* Search Bar */}
            <form onSubmit={handleSearch} className="flex-1 max-w-xl">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Busque por produtos"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 h-10 bg-background border-border rounded-lg text-sm"
                />
              </div>
            </form>

            {/* Right Actions */}
            <div className="flex items-center gap-5 shrink-0">
              {/* Central de Atendimento */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 text-foreground hover:text-primary transition-colors">
                    <Headset className="w-6 h-6 text-primary" />
                    <div className="text-left leading-tight">
                      <span className="text-[11px] text-muted-foreground">Central de</span>
                      <span className="flex items-center gap-0.5 text-sm font-semibold">
                        Atendimento <ChevronDown className="w-3 h-3" />
                      </span>
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {whatsappNumber && (
                    <DropdownMenuItem asChild>
                      <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                        <MessageCircle className="w-4 h-4" /> WhatsApp
                      </a>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <Link to="/contato" className="flex items-center gap-2">
                      <Headset className="w-4 h-4" /> Contato
                    </Link>
                  </DropdownMenuItem>
                  {isLoggedIn && (
                    <DropdownMenuItem asChild>
                      <Link to="/minha-conta" className="flex items-center gap-2">
                        <Package className="w-4 h-4" /> Suporte
                      </Link>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Entrar ou Cadastrar / Minha Conta */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 text-foreground hover:text-primary transition-colors">
                    <User className="w-6 h-6 text-primary" />
                    <div className="text-left leading-tight">
                      {isLoggedIn ? (
                        <>
                          <span className="text-[11px] text-muted-foreground">Minha</span>
                          <span className="flex items-center gap-0.5 text-sm font-semibold">
                            Conta <ChevronDown className="w-3 h-3" />
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-[11px] text-muted-foreground">Entrar ou</span>
                          <span className="flex items-center gap-0.5 text-sm font-semibold">
                            Cadastrar <ChevronDown className="w-3 h-3" />
                          </span>
                        </>
                      )}
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {isLoggedIn ? (
                    <>
                      <DropdownMenuItem asChild>
                        <Link to="/minha-conta" className="flex items-center gap-2">
                          <User className="w-4 h-4" /> Minha Conta
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/minha-conta" className="flex items-center gap-2">
                          <Package className="w-4 h-4" /> Meus Pedidos
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleLogout} className="flex items-center gap-2 text-destructive">
                        <LogOut className="w-4 h-4" /> Sair
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <>
                      <DropdownMenuItem asChild>
                        <Link to="/cliente/login" className="flex items-center gap-2">
                          <User className="w-4 h-4" /> Entrar
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/cliente/login" className="flex items-center gap-2">
                          <User className="w-4 h-4" /> Cadastrar
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Carrinho */}
              <Link
                to="/carrinho"
                className="flex items-center gap-2 text-foreground hover:text-primary transition-colors"
              >
                <div className="relative">
                  <ShoppingCart className="w-6 h-6 text-primary" />
                  {totalItems > 0 && (
                    <span className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 animate-in zoom-in-50 duration-200">
                      {totalItems}
                    </span>
                  )}
                </div>
                <div className="text-left leading-tight">
                  <span className="text-[11px] text-muted-foreground">Meu Carrinho</span>
                  <p className="text-sm font-semibold">{formatCurrency(totalPrice)}</p>
                </div>
              </Link>
            </div>
          </div>

          {/* Mobile Header */}
          <div className="flex md:hidden items-center justify-between h-14">
            <Link to="/catalogo" className="flex items-center shrink-0">
              <img src={logoImg} alt="Liberty Pharma" className="h-8 object-contain" />
            </Link>

            <div className="flex items-center gap-1">
              <Link to="/carrinho" className="relative p-2 text-foreground rounded-lg hover:bg-muted/50 transition-colors">
                <ShoppingCart className="w-5 h-5" />
                {totalItems > 0 && (
                  <span className="absolute top-0.5 right-0 bg-destructive text-destructive-foreground text-[10px] font-bold min-w-[16px] h-[16px] rounded-full flex items-center justify-center px-0.5 animate-in zoom-in-50 duration-200">
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

                  {/* Mobile Search */}
                  <form onSubmit={(e) => { handleSearch(e); setMobileOpen(false); }} className="px-4 pt-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder="Busque por produtos"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 pr-4 h-9 text-sm"
                      />
                    </div>
                  </form>

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
                        <link.icon
                          className={`w-4.5 h-4.5 ${
                            isActive(link.to) ? 'text-primary' : 'text-muted-foreground'
                          }`}
                        />
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

                    <Link
                      to="/contato"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-foreground hover:bg-muted/60 transition-all"
                    >
                      <Headset className="w-4.5 h-4.5 text-muted-foreground" />
                      Central de Atendimento
                      <ChevronRight className="w-4 h-4 ml-auto text-muted-foreground/40" />
                    </Link>

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
      <div className="h-[72px] hidden md:block" />
      <div className="h-14 md:hidden" />
    </>
  );
};

export default Header;
