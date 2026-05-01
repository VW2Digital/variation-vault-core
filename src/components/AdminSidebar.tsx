import { useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Package, LogOut, LayoutDashboard, Video, Settings, ShoppingBag, Users, MessageCircle, Star, AlertTriangle, Mail, LinkIcon, Ticket, FileBarChart, ChevronDown, Activity, Send, Wallet, FlaskConical, Layers } from 'lucide-react';
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
      { title: 'A/B Test', url: '/admin/ab-test', icon: FlaskConical },
    ],
  },
  {
    label: 'Catálogo',
    items: [
      { title: 'Produtos', url: '/admin/produtos', icon: Package },
      { title: 'Atacado', url: '/admin/atacado', icon: Layers },
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
    ],
  },
  {
    label: 'Marketing',
    items: [
      { title: 'Disparo de E-mails', url: '/admin/disparo-emails', icon: Send },
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
    <Sidebar
      collapsible="icon"
      className="border-r border-sidebar-border/60 bg-sidebar"
    >
      <SidebarContent className="gap-0 px-1">
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
            <SidebarGroup key={category.label} className="py-2 px-2">
              {!collapsed && (
                <SidebarGroupLabel className="px-2 text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-[0.14em]">
                  {category.label}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {category.items.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton asChild className="h-9 rounded-lg">
                            <NavLink
                              to={item.url}
                              end
                              className={cn(
                                'group/item relative flex items-center gap-2.5 text-sm text-sidebar-foreground/75 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground transition-colors',
                                collapsed ? 'justify-center px-0' : 'justify-start px-2.5',
                              )}
                              activeClassName="!bg-gradient-to-r !from-primary/15 !to-primary/5 !text-sidebar-primary font-semibold before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-[3px] before:rounded-r-full before:bg-sidebar-primary"
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
      <SidebarFooter className={cn('border-t border-sidebar-border/40 p-2')}>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              onClick={handleLogout}
              className={cn(
                "w-full h-9 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 gap-2 rounded-lg",
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
