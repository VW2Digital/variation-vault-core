import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Package, LogOut, LayoutDashboard, Video, Megaphone, Settings, ShoppingBag, Users, MessageCircle, Star, MousePointerClick, AlertTriangle, Mail } from 'lucide-react';
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

const menuCategories = [
  {
    label: 'Geral',
    items: [
      { title: 'Dashboard', url: '/admin', icon: LayoutDashboard },
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
      { title: 'Carrinho Abandonado', url: '/admin/carrinho-abandonado', icon: Mail },
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <Sidebar collapsible="offcanvas" className="border-r-0">
      <SidebarContent>
        {menuCategories.map((category) => (
          <SidebarGroup key={category.label}>
            <SidebarGroupLabel className="text-sidebar-foreground/60 uppercase tracking-wider text-xs">
              {!collapsed && category.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {category.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end
                        className="hover:bg-sidebar-accent/50"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                      >
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <Button
          variant="ghost"
          onClick={handleLogout}
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {!collapsed && 'Sair'}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
