import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Image, Palette, Type, Code, LayoutDashboard, CreditCard, Truck, MessageSquare, FileText, Settings, Plug, Tags, ShieldCheck, Database, Search, ChevronRight, X, BookOpen, GraduationCap } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import SiteUrlCard from '@/components/admin/SiteUrlCard';
import { fetchSettingsBulk } from '@/lib/api';

/**
 * Each item declares the `site_settings` keys that, when present, mean the
 * item is "configured". If ANY of these keys has a non-empty value, we mark
 * the row as Configured. Items without `statusKeys` show no badge.
 */
type CatItem = {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  statusKeys?: string[];
};

const categories: { label: string; icon: React.ComponentType<{ className?: string }>; items: CatItem[] }[] = [
  {
    label: 'AJUDA & DOCUMENTAÇÃO',
    icon: GraduationCap,
    items: [
      { title: 'Guias de Configuração', description: 'Tutoriais passo a passo para pagamento, frete, e-mail, scripts e mais', icon: BookOpen, path: 'guias' },
    ],
  },
  {
    label: 'DESIGN & IDENTIDADE',
    icon: Palette,
    items: [
      { title: 'Logo & Identidade', description: 'Logo, nome da loja e SEO', icon: Image, path: 'design', statusKeys: ['logo_url', 'store_name'] },
      { title: 'Cores do Tema', description: 'Cor primária e identidade visual', icon: Palette, path: 'cores', statusKeys: ['primary_color'] },
      { title: 'Fontes', description: 'Fonte dos títulos e do corpo do texto', icon: Type, path: 'fontes', statusKeys: ['font_heading', 'font_body'] },
      { title: 'CSS Customizado', description: 'Estilos personalizados para a loja', icon: Code, path: 'css', statusKeys: ['custom_css'] },
    ],
  },
  {
    label: 'PÁGINA INICIAL',
    icon: LayoutDashboard,
    items: [
      { title: 'Banners & Popups', description: 'Gestão de banners e popups promocionais', icon: LayoutDashboard, path: 'pagina-inicial' },
      { title: 'Trust Bar (Catálogo)', description: 'Edite os itens da barra de destaques (frete, pagamento, segurança)', icon: ShieldCheck, path: 'trust-bar', statusKeys: ['trust_bar_items'] },
    ],
  },
  {
    label: 'COMERCIAL & PAGAMENTO',
    icon: CreditCard,
    items: [
      { title: 'Gateways de Pagamento', description: 'Asaas, Mercado Pago, parcelamento e descontos PIX', icon: CreditCard, path: 'pagamento', statusKeys: ['payment_gateway'] },
    ],
  },
  {
    label: 'CATÁLOGO',
    icon: Tags,
    items: [
      { title: 'Categorias de Produtos', description: 'Crie e gerencie categorias para organizar seus produtos', icon: Tags, path: 'categorias', statusKeys: ['product_categories'] },
    ],
  },
  {
    label: 'LOGÍSTICA',
    icon: Truck,
    items: [
      { title: 'Melhor Envio & Frete', description: 'Integração, remetente e dimensões de embalagem', icon: Truck, path: 'logistica', statusKeys: ['melhor_envio_token', 'melhor_envio_sender_name'] },
    ],
  },
  {
    label: 'COMUNICAÇÃO',
    icon: MessageSquare,
    items: [
      { title: 'WhatsApp, Email & Mensagens', description: 'WhatsApp, Evolution API e SMTP Hostinger', icon: MessageSquare, path: 'comunicacao', statusKeys: ['smtp_host', 'evolution_api_url', 'whatsapp_number'] },
    ],
  },
  {
    label: 'RODAPÉ & LEGAL',
    icon: FileText,
    items: [
      { title: 'Rodapé & Informações Legais', description: 'Links do footer, termos e privacidade', icon: FileText, path: 'rodape', statusKeys: ['footer_company_info'] },
    ],
  },
  {
    label: 'AVANÇADO',
    icon: Settings,
    items: [
      { title: 'Scripts & Widgets', description: 'Widget de chat, scripts customizados e configurações técnicas', icon: Code, path: 'avancado', statusKeys: ['custom_head_scripts', 'chat_widget_embed'] },
      { title: 'Integração API', description: 'Endpoint e credenciais para CRM e agentes de IA', icon: Plug, path: 'api', statusKeys: ['orders_api_key'] },
      { title: 'Backup & Restauração', description: 'Baixar backup CSV de todas as tabelas e restaurar a partir de arquivo CSV', icon: Database, path: 'backup' },
    ],
  },
];

const SettingsIndex = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [statusLoading, setStatusLoading] = useState(true);

  // Collect every status key once and fetch in a single round-trip.
  const allStatusKeys = useMemo(() => {
    const set = new Set<string>();
    for (const cat of categories) {
      for (const item of cat.items) {
        for (const k of item.statusKeys || []) set.add(k);
      }
    }
    return Array.from(set);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchSettingsBulk(allStatusKeys)
      .then((map) => {
        if (!cancelled) setStatusMap(map);
      })
      .catch(() => {
        // Silent: status badges are non-essential.
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [allStatusKeys]);

  const isConfigured = (item: CatItem) => {
    if (!item.statusKeys || item.statusKeys.length === 0) return null;
    return item.statusKeys.some((k) => (statusMap[k] || '').trim().length > 0);
  };

  // Filter categories based on the search query (matches title or description).
  const visibleCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) =>
            item.title.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q) ||
            cat.label.toLowerCase().includes(q),
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [query]);

  return (
    <div className="space-y-6 w-full">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">CONFIGURAÇÕES</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie as integrações e preferências da loja.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar configuração…"
            className="pl-9 pr-9"
            aria-label="Buscar configuração"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground"
              aria-label="Limpar busca"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <SiteUrlCard />

      {visibleCategories.length === 0 && (
        <div className="border border-dashed border-border/60 rounded-lg p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhuma configuração encontrada para <strong className="text-foreground">"{query}"</strong>.
          </p>
        </div>
      )}

      {visibleCategories.map((category) => (
        <div key={category.label} className="space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <category.icon className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{category.label}</h2>
          </div>
          <div className="border border-border/50 rounded-lg divide-y divide-border/50 bg-card">
            {category.items.map((item) => {
              const configured = isConfigured(item);
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(`/admin/configuracoes/${item.path}`)}
                  className="w-full flex items-center gap-4 px-4 py-4 hover:bg-accent/50 transition-colors text-left first:rounded-t-lg last:rounded-b-lg"
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted">
                    <item.icon className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-foreground">{item.title}</p>
                      {!statusLoading && configured === true && (
                        <Badge variant="secondary" className="h-5 text-[10px] gap-1">
                          Configurado
                        </Badge>
                      )}
                      {!statusLoading && configured === false && (
                        <Badge variant="outline" className="h-5 text-[10px] text-muted-foreground">
                          Pendente
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default SettingsIndex;
