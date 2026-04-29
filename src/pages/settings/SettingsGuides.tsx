import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CreditCard,
  Truck,
  Mail,
  MessageSquare,
  Code,
  Image as ImageIcon,
  Tags,
  Plug,
  ShieldCheck,
  ExternalLink,
  ArrowLeft,
} from 'lucide-react';
import iconGuias from '@/assets/icon-guias-3d.png';

interface GuideStep {
  text: string;
  hint?: string;
}

interface Guide {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  level: 'Básico' | 'Intermediário' | 'Avançado';
  time: string;
  steps: GuideStep[];
  cta?: { label: string; path: string };
  warnings?: string[];
}

const guides: Guide[] = [
  {
    id: 'pagamento',
    title: 'Configurar Gateway de Pagamento',
    description: 'Conecte Asaas, Mercado Pago, PagBank ou Pagar.me para receber pagamentos.',
    icon: CreditCard,
    level: 'Intermediário',
    time: '10 min',
    steps: [
      { text: 'Acesse o painel do gateway escolhido (Asaas, Mercado Pago, PagBank ou Pagar.me) e crie/copie sua API Key de produção.' },
      { text: 'Em Configurações → Gateways de Pagamento, escolha o gateway principal e cole a chave nos campos correspondentes.' },
      { text: 'Defina o ambiente como "Produção" (ou "Sandbox" para testes).', hint: 'Sandbox usa cartões de teste, nunca cobra de verdade.' },
      { text: 'Configure parcelamento (até 12x), juros e desconto PIX conforme sua estratégia comercial.' },
      { text: 'Copie a URL de Webhook exibida na tela e cadastre no painel do gateway para receber confirmações automáticas.' },
      { text: 'Faça um pedido de teste de R$ 1,00 com PIX e cartão para validar o fluxo completo.' },
    ],
    warnings: [
      'Mercado Pago exige uma chave PIX cadastrada na conta receptora, senão o PIX falha.',
      'Nunca use chaves de Sandbox em produção — desabilite após os testes.',
    ],
    cta: { label: 'Abrir Gateways', path: '/admin/configuracoes/pagamento' },
  },
  {
    id: 'logistica',
    title: 'Configurar Melhor Envio (Frete)',
    description: 'Cálculo de frete em tempo real e geração de etiquetas.',
    icon: Truck,
    level: 'Intermediário',
    time: '15 min',
    steps: [
      { text: 'Crie uma conta em melhorenvio.com.br e complete o cadastro do remetente (nome, CPF/CNPJ, endereço de coleta).' },
      { text: 'Em Configurações → Melhor Envio & Frete, clique em "Conectar com Melhor Envio" e autorize o acesso (OAuth).' },
      { text: 'Use o botão "Importar dados do remetente" para preencher automaticamente os dados da conta.' },
      { text: 'Confira CEP de origem, dimensões padrão da embalagem (cm) e peso mínimo (kg).' },
      { text: 'Em cada produto, defina dimensões e peso reais — isso afeta diretamente o cálculo do frete.' },
    ],
    warnings: [
      'O CPF/CNPJ do remetente NÃO pode ser igual ao do destinatário, senão a etiqueta é bloqueada.',
      'Geração automática de etiquetas pode falhar com erro E-WAF-0003 (bloqueio AWS) — use o fluxo manual nesses casos.',
    ],
    cta: { label: 'Abrir Melhor Envio', path: '/admin/configuracoes/logistica' },
  },
  {
    id: 'email',
    title: 'Configurar E-mails Transacionais (Resend)',
    description: 'Envio automático de confirmações de pedido, boas-vindas e recuperação de carrinho.',
    icon: Mail,
    level: 'Intermediário',
    time: '20 min',
    steps: [
      { text: 'Crie uma conta gratuita em resend.com e gere uma API Key.' },
      { text: 'Adicione e VERIFIQUE seu domínio próprio no Resend (ex: suaempresa.com.br) seguindo as instruções de DNS.' },
      { text: 'Em Configurações → Comunicação, cole a API Key e o e-mail remetente verificado (ex: contato@suaempresa.com.br).' },
      { text: 'Personalize templates em Comunicação → Templates de E-mail (boas-vindas, pedido, carrinho abandonado).' },
      { text: 'Use "Disparo de E-mails" para envios em massa segmentados.' },
    ],
    warnings: [
      'NÃO é possível usar e-mails gratuitos como Gmail ou Hotmail como remetente. É obrigatório domínio próprio verificado.',
      'Sem domínio verificado, todos os e-mails ficarão na pasta de spam ou serão bloqueados.',
    ],
    cta: { label: 'Abrir Comunicação', path: '/admin/configuracoes/comunicacao' },
  },
  {
    id: 'whatsapp',
    title: 'Configurar WhatsApp (Evolution API)',
    description: 'Mensagens automáticas de pedido, PIX e recuperação via WhatsApp.',
    icon: MessageSquare,
    level: 'Avançado',
    time: '30 min',
    steps: [
      { text: 'Contrate ou hospede uma instância da Evolution API (ver evolution-api.com).' },
      { text: 'Conecte um número de WhatsApp lendo o QR Code no painel da Evolution API.' },
      { text: 'Copie a URL da instância, a API Key e o nome da instância.' },
      { text: 'Em Configurações → Comunicação, cole esses dados nos campos da Evolution API.' },
      { text: 'Defina o número administrativo (com DDI 55) que receberá alertas de falha de pagamento.' },
      { text: 'Faça um pedido de teste para validar o envio automático.' },
    ],
    warnings: [
      'Use sempre um número dedicado para evitar bloqueio do WhatsApp por uso comercial automatizado.',
    ],
    cta: { label: 'Abrir Comunicação', path: '/admin/configuracoes/comunicacao' },
  },
  {
    id: 'scripts',
    title: 'Instalar Pixels e Analytics (Scripts)',
    description: 'Google Analytics, Meta Pixel, Google Tag Manager e widgets de chat.',
    icon: Code,
    level: 'Básico',
    time: '5 min',
    steps: [
      { text: 'Copie o snippet completo do seu provedor (GA4, Meta Pixel, GTM, etc.) — incluindo as tags <script>.' },
      { text: 'Acesse Configurações → Scripts & Widgets.' },
      { text: 'Em "Scripts no Head", clique em "Adicionar script", dê um nome descritivo (ex: "Google Analytics") e cole o código.' },
      { text: 'Para pixels de conversão e chatbots, use "Scripts no Footer" (carregam após o conteúdo).' },
      { text: 'Para widget de chat (CRM), cole o código no campo dedicado "Widget de Chat".' },
      { text: 'Salve, abra a loja em uma aba anônima e valide com a extensão do provedor (Pixel Helper, GA Debugger).' },
    ],
    warnings: [
      'Widget de chat tem altura máxima de 500px para não cobrir o conteúdo.',
    ],
    cta: { label: 'Abrir Scripts', path: '/admin/configuracoes/avancado' },
  },
  {
    id: 'design',
    title: 'Personalizar Identidade Visual',
    description: 'Logo, cores, fontes e SEO da loja.',
    icon: ImageIcon,
    level: 'Básico',
    time: '10 min',
    steps: [
      { text: 'Em Configurações → Logo & Identidade, faça upload da logo (PNG transparente recomendado).' },
      { text: 'Defina nome da loja, título e descrição para SEO (aparecem no Google e ao compartilhar links).' },
      { text: 'Em "Cores do Tema", escolha a cor primária — botões e destaques se ajustam automaticamente.' },
      { text: 'Em "Fontes", selecione as famílias para títulos e corpo de texto.' },
      { text: 'Use "CSS Customizado" para ajustes finos (apenas se você souber CSS).' },
    ],
    cta: { label: 'Abrir Design', path: '/admin/configuracoes/design' },
  },
  {
    id: 'categorias',
    title: 'Organizar Catálogo por Categorias',
    description: 'Crie categorias para filtrar produtos no catálogo.',
    icon: Tags,
    level: 'Básico',
    time: '5 min',
    steps: [
      { text: 'Acesse Configurações → Categorias de Produtos.' },
      { text: 'Clique em "Adicionar categoria" e digite o nome (ex: "Suplementos", "Hormônios").' },
      { text: 'Reordene arrastando as categorias na ordem que devem aparecer no catálogo.' },
      { text: 'Em cada produto (Produtos → Editar), associe uma ou mais categorias.' },
      { text: 'No catálogo público, os filtros aparecem automaticamente.' },
    ],
    cta: { label: 'Abrir Categorias', path: '/admin/configuracoes/categorias' },
  },
  {
    id: 'api',
    title: 'Integrar com CRM via API',
    description: 'Endpoint REST para puxar pedidos automaticamente.',
    icon: Plug,
    level: 'Avançado',
    time: '15 min',
    steps: [
      { text: 'Acesse Configurações → Integração API e copie a URL do endpoint e a chave de acesso (x-api-key).' },
      { text: 'No seu CRM ou agente de IA, configure uma requisição GET para o endpoint enviando o header "x-api-key".' },
      { text: 'Os pedidos vêm em JSON com cliente, itens, status, gateway e dados de envio.' },
      { text: 'Use filtros por data ou status para sincronizar apenas o necessário.' },
    ],
    warnings: [
      'NUNCA exponha a x-api-key em código frontend ou repositórios públicos. Trate como senha.',
    ],
    cta: { label: 'Abrir API', path: '/admin/configuracoes/api' },
  },
  {
    id: 'trust-bar',
    title: 'Configurar Trust Bar e Banners',
    description: 'Barra de destaques e carrossel da home.',
    icon: ShieldCheck,
    level: 'Básico',
    time: '10 min',
    steps: [
      { text: 'Em Configurações → Trust Bar, edite os ícones e textos (ex: "Frete grátis acima de R$ 200").' },
      { text: 'Em Configurações → Banners & Popups, suba banners desktop e mobile (use as proporções recomendadas).' },
      { text: 'Defina link de destino e prazo de exibição em cada banner.' },
      { text: 'Para popups promocionais, escolha em quais páginas exibir e a frequência.' },
    ],
    cta: { label: 'Abrir Página Inicial', path: '/admin/configuracoes/pagina-inicial' },
  },
];

const levelColor = {
  'Básico': 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  'Intermediário': 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  'Avançado': 'bg-rose-500/10 text-rose-600 border-rose-500/20',
} as const;

const SettingsGuides = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-start gap-3 mb-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/admin/configuracoes')}
          className="shrink-0 mt-0.5"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-4 flex-1">
          <img
            src={iconGuias}
            alt=""
            width={64}
            height={64}
            loading="lazy"
            className="w-14 h-14 sm:w-16 sm:h-16 object-contain shrink-0"
          />
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
              Guias de Configuração
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Tutoriais passo a passo para configurar cada integração da loja.
            </p>
          </div>
        </div>
      </div>

      <Card className="border-border/50">
        <CardContent className="p-2 sm:p-4">
          <Accordion type="multiple" className="w-full">
            {guides.map((guide) => {
              const Icon = guide.icon;
              return (
                <AccordionItem key={guide.id} value={guide.id} className="border-border/50">
                  <AccordionTrigger className="hover:no-underline px-2 sm:px-3 py-4">
                    <div className="flex items-center gap-3 sm:gap-4 flex-1 text-left">
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary shrink-0">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm sm:text-base font-medium text-foreground">
                            {guide.title}
                          </p>
                          <Badge variant="outline" className={`h-5 text-[10px] ${levelColor[guide.level]}`}>
                            {guide.level}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">~{guide.time}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {guide.description}
                        </p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-2 sm:px-3 pb-4">
                    <div className="pl-0 sm:pl-14 space-y-4">
                      <ol className="space-y-3">
                        {guide.steps.map((step, idx) => (
                          <li key={idx} className="flex gap-3">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-semibold shrink-0">
                              {idx + 1}
                            </span>
                            <div className="flex-1 pt-0.5">
                              <p className="text-sm text-foreground">{step.text}</p>
                              {step.hint && (
                                <p className="text-xs text-muted-foreground mt-1 italic">
                                  {step.hint}
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>

                      {guide.warnings && guide.warnings.length > 0 && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2 uppercase tracking-wide">
                            Atenção
                          </p>
                          <ul className="space-y-1.5">
                            {guide.warnings.map((w, i) => (
                              <li key={i} className="text-xs text-foreground/80 flex gap-2">
                                <span className="text-amber-600 shrink-0">•</span>
                                <span>{w}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {guide.cta && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(guide.cta!.path)}
                          className="gap-2"
                        >
                          {guide.cta.label}
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsGuides;