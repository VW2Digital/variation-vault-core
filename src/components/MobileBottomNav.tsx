import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Heart, ShoppingCart, User } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCart } from '@/contexts/CartContext';

const navItems = [
  { path: '/', icon: Home, label: 'Inicio' },
  { path: '/carrinho', icon: ShoppingCart, label: 'Carrinho' },
  { path: '/minha-conta', icon: User, label: 'Conta' },
];

const HIDDEN_ROUTES = ['/login', '/admin', '/cliente/login', '/checkout', '/checkout-carrinho', '/pagar', '/minha-conta'];

const MobileBottomNav = () => {
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const { totalItems } = useCart();

  if (!isMobile) return null;

  const isHidden = HIDDEN_ROUTES.some(r => location.pathname.startsWith(r));
  if (isHidden) return null;

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/' || location.pathname === '/catalogo';
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border shadow-lg md:hidden">
      <div className="flex items-center justify-around h-16">
        {navItems.map(({ path, icon: Icon, label }) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors relative ${
              isActive(path)
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <div className="relative">
              <Icon className="w-5 h-5" />
              {path === '/carrinho' && totalItems > 0 && (
                <span className="absolute -top-1.5 -right-2.5 bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {totalItems > 9 ? '9+' : totalItems}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};

export default MobileBottomNav;
