import { useNavigate } from 'react-router-dom';
import { Image, Palette, Type, Code, LayoutDashboard, CreditCard, Truck, MessageSquare, FileText, Settings, Plug, Tags, ShieldCheck, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChevronRight } from 'lucide-react';
import SiteUrlCard from '@/components/admin/SiteUrlCard';

const categories = [
  {
    label: 'DESIGN & IDENTIDADE',
    icon: Palette,
    items: [
      { title: 'Logo & Identidade', description: 'Logo, nome da loja e SEO', icon: Image, path: 'design' },
      { title: 'Cores do Tema', description: 'Cor primária e identidade visual', icon: Palette, path: 'cores' },
      { title: 'Fontes', description: 'Fonte dos títulos e do corpo do texto', icon: Type, path: 'fontes' },
      { title: 'CSS Customizado', description: 'Estilos personalizados para a loja', icon: Code, path: 'css' },
    ],
  },
  {
    label: 'PÁGINA INICIAL',
    icon: LayoutDashboard,
    items: [
      { title: 'Banners & Popups', description: 'Gestão de banners e popups promocionais', icon: LayoutDashboard, path: 'pagina-inicial' },
      { title: 'Trust Bar (Catálogo)', description: 'Edite os itens da barra de destaques (frete, pagamento, segurança)', icon: ShieldCheck, path: 'trust-bar' },
    ],
  },
  {
    label: 'COMERCIAL & PAGAMENTO',
    icon: CreditCard,
    items: [
      { title: 'Gateways de Pagamento', description: 'Asaas, Mercado Pago, parcelamento e descontos PIX', icon: CreditCard, path: 'pagamento' },
    ],
  },
  {
    label: 'CATÁLOGO',
    icon: Tags,
    items: [
      { title: 'Categorias de Produtos', description: 'Crie e gerencie categorias para organizar seus produtos', icon: Tags, path: 'categorias' },
    ],
  },
  {
    label: 'LOGÍSTICA',
    icon: Truck,
    items: [
      { title: 'Melhor Envio & Frete', description: 'Integração, remetente e dimensões de embalagem', icon: Truck, path: 'logistica' },
    ],
  },
  {
    label: 'COMUNICAÇÃO',
    icon: MessageSquare,
    items: [
      { title: 'WhatsApp, Email & Mensagens', description: 'WhatsApp, Evolution API e Resend', icon: MessageSquare, path: 'comunicacao' },
    ],
  },
  {
    label: 'RODAPÉ & LEGAL',
    icon: FileText,
    items: [
      { title: 'Rodapé & Informações Legais', description: 'Links do footer, termos e privacidade', icon: FileText, path: 'rodape' },
    ],
  },
  {
    label: 'AVANÇADO',
    icon: Settings,
    items: [
      { title: 'Scripts & Widgets', description: 'Widget de chat, scripts customizados e configurações técnicas', icon: Code, path: 'avancado' },
      { title: 'Integração API', description: 'Endpoint e credenciais para CRM e agentes de IA', icon: Plug, path: 'api' },
      { title: 'Backup & Restauração', description: 'Baixar backup CSV de todas as tabelas e restaurar a partir de arquivo CSV', icon: Database, path: 'backup' },
    ],
  },
];

const SettingsIndex = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">CONFIGURAÇÕES</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie as integrações e preferências da loja.</p>
        </div>
      </div>

      <SiteUrlCard />

      {categories.map((category) => (
        <div key={category.label} className="space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <category.icon className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{category.label}</h2>
          </div>
          <div className="border border-border/50 rounded-lg divide-y divide-border/50 bg-card">
            {category.items.map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(`/admin/configuracoes/${item.path}`)}
                className="w-full flex items-center gap-4 px-4 py-4 hover:bg-accent/50 transition-colors text-left first:rounded-t-lg last:rounded-b-lg"
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted">
                  <item.icon className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default SettingsIndex;
