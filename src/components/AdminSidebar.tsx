import { useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Package, LogOut, LayoutDashboard, Video, Megaphone, Settings, ShoppingBag, Users, MessageCircle, Star, MousePointerClick, AlertTriangle, Mail, LinkIcon, Ticket, FileBarChart, ChevronDown, Activity, Send, BellRing } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

const menuCategories = [
  {
    label: 'Geral',
    items: [
      { title: 'Dashboard', url: '/admin', icon: LayoutDashboard },
      { title: 'Relatórios', url: '/admin/relatorios', icon: FileBarChart },
    ],
  },
  {
    label: 'Catálogo',
    items: [
      { title: 'Produtos', url: '/admin/produtos', icon: Package },
      { title: 'Banners', url: '/admin/banners', icon: Megaphone },
      { title: 'Popups', url: '/admin/popups', icon: MousePointerClick },
      { title: 'Depoimentos', url: '/admin/depoimentos', icon: Video },
    ],
  },
  {
    label: 'Vendas',
    items: [
      { title: 'Pedidos', url: '/admin/pedidos', icon: ShoppingBag },
      { title: 'Falhas Pgto', url: '/admin/falhas-pagamento', icon: AlertTriangle },
      { title: 'Webhooks Logs', url: '/admin/webhooks-logs', icon: Activity },
      { title: 'Carrinho Abandonado', url: '/admin/carrinho-abandonado', icon: Mail },
      { title: 'Links de Pagamento', url: '/admin/links-pagamento', icon: LinkIcon },
      { title: 'Cupons', url: '/admin/cupons', icon: Ticket },
    ],
  },
  {
    label: 'Clientes',
    items: [
      { title: 'Usuários', url: '/admin/usuarios', icon: Users },
      { title: 'Avaliações', url: '/admin/avaliacoes', icon: Star },
      { title: 'Suporte', url: '/admin/suporte', icon: MessageCircle },
      { title: 'Templates Email', url: '/admin/templates-email', icon: Mail },
      { title: 'Eventos de Email', url: '/admin/eventos-email', icon: BellRing },
      { title: 'Logs de Email', url: '/admin/logs-email', icon: Send },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { title: 'Configurações', url: '/admin/configuracoes', icon: Settings },
    ],
  },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();

  // Find which category contains the active route
  const activeCategoryIndex = menuCategories.findIndex(cat =>
    cat.items.some(item => location.pathname === item.url)
  );

  const [openGroups, setOpenGroups] = useState<Record<number, boolean>>(() => {
    const initial: Record<number, boolean> = {};
    menuCategories.forEach((_, i) => {
      initial[i] = i === activeCategoryIndex;
    });
    return initial;
  });

  const toggleGroup = (index: number) => {
    setOpenGroups(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarContent className="gap-0">
        {menuCategories.map((category, index) => {
          const isOpen = openGroups[index] ?? false;
          const hasActiveItem = category.items.some(item => location.pathname === item.url);

          if (isMobile) {
            return (
              <div key={category.label} className="border-b border-sidebar-border/50">
                <button
                  onClick={() => toggleGroup(index)}
                  className={cn(
                    "flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition-colors",
                    hasActiveItem
                      ? "text-sidebar-primary bg-sidebar-accent/30"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/20"
                  )}
                >
                  <div className="flex items-center gap-3">
                    {(() => { const Icon = category.items[0].icon; return <Icon className="h-4 w-4 shrink-0" />; })()}
                    <span>{category.label}</span>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-sidebar-foreground/50 transition-transform duration-200",
                      isOpen && "rotate-180"
                    )}
                  />
                </button>
                {isOpen && (
                  <div className="pb-2">
                    {category.items.map((item) => (
                      <NavLink
                        key={item.title}
                        to={item.url}
                        end
                        className="flex items-center gap-3 px-4 pl-11 py-2.5 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground transition-colors"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span>{item.title}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          // Desktop sidebar (unchanged)
          return (
            <SidebarGroup key={category.label} className="py-1 px-2">
              <SidebarGroupLabel className="text-sidebar-foreground/60 uppercase tracking-wider text-xs">
                {!collapsed && category.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {category.items.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton asChild>
                            <NavLink
                              to={item.url}
                              end
                              className={`hover:bg-sidebar-accent/50 flex items-center gap-2 ${collapsed ? 'justify-center' : 'justify-start'}`}
                              activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                            >
                              <item.icon className="h-4 w-4 shrink-0" />
                              {!collapsed && <span className="truncate">{item.title}</span>}
                            </NavLink>
                          </SidebarMenuButton>
                        </TooltipTrigger>
                        {collapsed && (
                          <TooltipContent side="right" className="text-xs font-medium z-[999]">
                            {item.title}
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarFooter className={isMobile ? "border-t border-sidebar-border/50" : ""}>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              onClick={handleLogout}
              className={cn(
                "w-full text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 gap-2",
                collapsed ? 'justify-center' : 'justify-start'
              )}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {!collapsed && <span>Sair</span>}
            </Button>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side="right" className="text-xs font-medium z-[999]">
              Sair
            </TooltipContent>
          )}
        </Tooltip>
      </SidebarFooter>
    </Sidebar>
  );
}
