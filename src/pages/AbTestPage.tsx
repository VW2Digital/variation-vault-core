import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminKpiCard } from '@/components/admin/AdminKpiCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FlaskConical, Eye, MousePointerClick, TrendingUp, RefreshCw, Trash2, ShoppingCart, Truck, Star, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  loadAbConfig,
  saveAbConfig,
  DEFAULT_AB_CONFIG,
  formatDiscountBadge,
  type AbTestConfig,
  type AbVariantConfig,
} from '@/lib/abTestConfig';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

type Row = {
  variant: 'A' | 'B';
  event_type: 'impression' | 'cta_click';
  session_id: string;
};

type PreviewProduct = {
  id: string;
  name: string;
  subtitle: string | null;
  images: string[] | null;
  free_shipping: boolean;
  is_bestseller: boolean;
  pix_discount_percent: number | null;
  variations: {
    id: string;
    dosage: string;
    price: number;
    offer_price: number | null;
    is_offer: boolean;
    image_url: string | null;
    images: string[] | null;
  }[];
};

type Stats = {
  impressions: number;
  uniqueImpressions: number;
  clicks: number;
  uniqueClicks: number;
  ctr: number; // %
};

const emptyStats: Stats = {
  impressions: 0,
  uniqueImpressions: 0,
  clicks: 0,
  uniqueClicks: 0,
  ctr: 0,
};

function aggregate(rows: Row[], variant: 'A' | 'B'): Stats {
  const v = rows.filter((r) => r.variant === variant);
  const impressions = v.filter((r) => r.event_type === 'impression').length;
  const clicks = v.filter((r) => r.event_type === 'cta_click').length;
  const uniqueImpressions = new Set(
    v.filter((r) => r.event_type === 'impression').map((r) => r.session_id),
  ).size;
  const uniqueClicks = new Set(
    v.filter((r) => r.event_type === 'cta_click').map((r) => r.session_id),
  ).size;
  const ctr = uniqueImpressions > 0 ? (uniqueClicks / uniqueImpressions) * 100 : 0;
  return { impressions, uniqueImpressions, clicks, uniqueClicks, ctr };
}

export default function AbTestPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<PreviewProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [config, setConfig] = useState<AbTestConfig>(DEFAULT_AB_CONFIG);
  const [savingConfig, setSavingConfig] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('ab_card_events')
      .select('variant, event_type, session_id')
      .order('created_at', { ascending: false })
      .limit(50000);
    if (error) {
      toast.error('Falha ao carregar eventos: ' + error.message);
    } else {
      setRows((data || []) as Row[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    loadProducts();
    loadAbConfig(true).then(setConfig).catch(() => {});
  }, []);

  const loadProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, subtitle, images, free_shipping, is_bestseller, pix_discount_percent, product_variations(id, dosage, price, offer_price, is_offer, image_url, images)')
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .limit(100);
    if (error) {
      toast.error('Falha ao carregar produtos: ' + error.message);
      return;
    }
    const list = ((data || []) as any[])
      .map((p) => ({
        ...p,
        variations: (p.product_variations || []).filter((v: any) => v),
      }))
      .filter((p) => p.variations.length > 0) as PreviewProduct[];
    setProducts(list);
    if (list.length > 0) setSelectedProductId(list[0].id);
  };

  const previewProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || null,
    [products, selectedProductId],
  );

  const updateVariant = (variant: 'A' | 'B', patch: Partial<AbVariantConfig>) => {
    setConfig((prev) => ({ ...prev, [variant]: { ...prev[variant], ...patch } }));
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Sessão expirada.');
        return;
      }
      await saveAbConfig(config, user.id);
      toast.success('Configuração das variantes salva.');
    } catch (e: any) {
      toast.error('Falha ao salvar: ' + (e?.message || 'erro desconhecido'));
    } finally {
      setSavingConfig(false);
    }
  };

  const handleResetConfig = () => {
    setConfig(DEFAULT_AB_CONFIG);
    toast.info('Valores padrão restaurados (não salvo ainda).');
  };

  const statsA = useMemo(() => aggregate(rows, 'A'), [rows]);
  const statsB = useMemo(() => aggregate(rows, 'B'), [rows]);

  const winner: 'A' | 'B' | 'tie' | null = useMemo(() => {
    if (statsA.uniqueImpressions < 30 || statsB.uniqueImpressions < 30) return null;
    if (Math.abs(statsA.ctr - statsB.ctr) < 0.5) return 'tie';
    return statsA.ctr > statsB.ctr ? 'A' : 'B';
  }, [statsA, statsB]);

  const lift = statsA.ctr > 0 ? ((statsB.ctr - statsA.ctr) / statsA.ctr) * 100 : 0;

  const reset = async () => {
    const { error } = await supabase.from('ab_card_events').delete().not('id', 'is', null);
    if (error) {
      toast.error('Falha ao zerar: ' + error.message);
    } else {
      toast.success('Eventos apagados');
      load();
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={FlaskConical}
        title="A/B Test — Card de Produto"
        description="Compara o layout discreto (A) com o layout de conversão agressiva (B). Métrica principal: CTR de cliques únicos no botão Adicionar ao Carrinho."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive border-destructive/30">
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Zerar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Apagar todos os eventos do A/B?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação é permanente. Os eventos de impressão e clique serão apagados e o teste recomeça do zero.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={reset}>Apagar tudo</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        }
      />

      {/* Resumo do vencedor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Resultado
          </CardTitle>
        </CardHeader>
        <CardContent>
          {winner === null ? (
            <p className="text-sm text-muted-foreground">
              Aguardando dados suficientes (mínimo 30 sessões únicas por variante).
              Atual: A = {statsA.uniqueImpressions} · B = {statsB.uniqueImpressions}.
            </p>
          ) : winner === 'tie' ? (
            <p className="text-sm">
              <Badge variant="secondary">Empate técnico</Badge>{' '}
              Diferença de CTR menor que 0,5 ponto percentual.
            </p>
          ) : (
            <div className="space-y-1">
              <p className="text-sm">
                <Badge className={winner === 'B' ? 'bg-success text-white' : 'bg-primary text-primary-foreground'}>
                  Variante {winner} está vencendo
                </Badge>
              </p>
              <p className="text-xs text-muted-foreground">
                CTR A: {statsA.ctr.toFixed(2)}% · CTR B: {statsB.ctr.toFixed(2)}% · Lift de B sobre A: {lift >= 0 ? '+' : ''}
                {lift.toFixed(1)}%
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPIs lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <VariantPanel label="A — Layout discreto (controle)" tone="default" stats={statsA} />
        <VariantPanel label="B — Conversão agressiva" tone="primary" stats={statsB} />
      </div>

      {/* Prévia visual das variantes */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <CardTitle className="text-base">Prévia visual das variantes</CardTitle>
            {products.length > 0 && (
              <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                <SelectTrigger className="w-full sm:w-[260px]">
                  <SelectValue placeholder="Selecione um produto" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {previewProduct ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <PreviewCard variant="A" product={previewProduct} cfg={config.A} />
                <PreviewCard variant="B" product={previewProduct} cfg={config.B} />
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Prévias reproduzem o card de catálogo usando dados reais do produto selecionado.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum produto com variação disponível para preview.</p>
          )}
        </CardContent>
      </Card>

      {/* Editor de configuração das variantes */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <CardTitle className="text-base">Configuração das variantes</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleResetConfig}>
                Restaurar padrão
              </Button>
              <Button size="sm" onClick={handleSaveConfig} disabled={savingConfig}>
                {savingConfig ? 'Salvando…' : 'Salvar configuração'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <VariantEditor variant="A" cfg={config.A} onChange={(p) => updateVariant('A', p)} />
          <VariantEditor variant="B" cfg={config.B} onChange={(p) => updateVariant('B', p)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Como testar manualmente</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>Acesse a home com um destes parâmetros para forçar uma variante:</p>
          <ul className="list-disc list-inside space-y-0.5 font-mono text-xs">
            <li>?ab=A — força layout antigo</li>
            <li>?ab=B — força layout novo</li>
            <li>?ab=off — desliga o tracking (não loga eventos)</li>
          </ul>
          <p className="pt-2">Cada visitante recebe uma variante 50/50 determinística pelo seu sessionId, salva em localStorage para manter consistência entre visitas.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function PreviewCard({ variant, product, cfg }: { variant: 'A' | 'B'; product: PreviewProduct; cfg: AbVariantConfig }) {
  const isB = variant === 'B';
  // Pega primeira variação (preferindo uma em oferta)
  const variation =
    product.variations.find((v) => v.is_offer && v.offer_price && v.offer_price > 0) ||
    product.variations[0];
  const price = Number(variation.price) || 0;
  const hasOffer = variation.is_offer && variation.offer_price && variation.offer_price > 0;
  const finalPrice = hasOffer ? Number(variation.offer_price) : price;
  const discount = hasOffer && price > 0 ? Math.round(((price - finalPrice) / price) * 100) : 0;
  const image =
    (variation.images && variation.images[0]) ||
    variation.image_url ||
    (product.images && product.images[0]) ||
    '';
  const productName = product.name;
  const subtitle = variation.dosage
    ? `${variation.dosage}${product.subtitle ? ' · ' + product.subtitle : ''}`
    : product.subtitle || '';
  const pixPercent = Number(product.pix_discount_percent) || 0;
  const integerPart = Math.floor(finalPrice).toLocaleString('pt-BR');
  const decimalPart = finalPrice.toFixed(2).split('.')[1];

  // Logging diagnóstico da prévia (não polui métricas reais).
  // Identifica produto + variação exibidos no card de preview por variante.
  const impressionLoggedRef = useRef<string | null>(null);
  useEffect(() => {
    const key = `${variant}:${product.id}:${variation?.id ?? 'none'}`;
    if (impressionLoggedRef.current === key) return;
    impressionLoggedRef.current = key;
    // eslint-disable-next-line no-console
    console.info('[ab-preview] impression', {
      source: 'admin-ab-preview',
      variant,
      product_id: product.id,
      product_name: product.name,
      variation_id: variation?.id ?? null,
      variation_dosage: variation?.dosage ?? null,
      price,
      final_price: finalPrice,
      discount_pct: discount,
      cta_text: cfg.ctaText,
    });
  }, [variant, product.id, product.name, variation?.id, variation?.dosage, price, finalPrice, discount, cfg.ctaText]);

  const handleCtaClick = () => {
    const destination = `/produto/${product.id}${variation?.id ? `?v=${variation.id}` : ''}`;
    // eslint-disable-next-line no-console
    console.info('[ab-preview] cta_click', {
      source: 'admin-ab-preview',
      variant,
      product_id: product.id,
      product_name: product.name,
      variation_id: variation?.id ?? null,
      variation_dosage: variation?.dosage ?? null,
      cta_text: cfg.ctaText,
      destination,
    });
    try {
      window.open(destination, '_blank', 'noopener,noreferrer');
    } catch {
      window.location.href = destination;
    }
  };

  const destinationLabel = `/produto/${product.id}${variation?.id ? `?v=${variation.id}` : ''}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground">
          Variante {variant} — {isB ? 'Conversão agressiva' : 'Discreta (controle)'}
        </p>
        <Badge variant={isB ? 'default' : 'secondary'} className="text-[10px]">
          {isB ? 'Novo' : 'Atual'}
        </Badge>
      </div>

      <div className="max-w-[260px] mx-auto">
        <div
          className={`group rounded-xl border overflow-hidden transition-all duration-300 flex flex-col bg-card ${
            isB ? 'hover:shadow-xl border-border/50' : 'hover:shadow-lg border-border/50'
          }`}
        >
          <div className={`relative aspect-[1080/1450] bg-white overflow-hidden ${isB ? 'border-b border-border/40' : ''}`}>
            {image ? (
              <img
                src={image}
                alt={productName}
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/30 text-xs">
                [sem imagem]
              </div>
            )}
            {isB ? (
              <>
                <div className="absolute top-2 left-2 z-20 flex flex-col gap-1 items-start">
                  {cfg.showOfferBadge && discount > 0 && (
                    <Badge className="bg-destructive text-destructive-foreground text-[11px] font-extrabold px-2 py-0.5 shadow-md shadow-destructive/30 rounded-md">
                      {formatDiscountBadge(cfg.discountBadgeTemplate, discount)}
                    </Badge>
                  )}
                  {cfg.showFreeShippingImageBadge && product.free_shipping && (
                    <Badge className="bg-success text-white text-[9px] font-bold px-1.5 py-0.5 shadow-sm gap-0.5 rounded-md">
                      <Truck className="w-2.5 h-2.5" />
                      FRETE GRÁTIS
                    </Badge>
                  )}
                </div>
                {cfg.showBestsellerBadge && product.is_bestseller && (
                  <div className="absolute top-2 right-2 z-20">
                    <Badge className="bg-warning text-white text-[9px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 shadow-md rounded-md">
                      Mais Vendido
                    </Badge>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="absolute top-2 left-2 z-20 flex flex-col gap-1">
                  {cfg.showOfferBadge && discount > 0 && (
                    <Badge className="bg-destructive text-destructive-foreground text-[10px] font-bold">
                      {formatDiscountBadge(cfg.discountBadgeTemplate, discount)}
                    </Badge>
                  )}
                  {cfg.showFreeShippingImageBadge && product.free_shipping && (
                    <Badge className="bg-success text-white text-[9px] font-bold gap-0.5 px-1.5 py-0.5">
                      <Truck className="w-2.5 h-2.5" />
                      FRETE GRÁTIS
                    </Badge>
                  )}
                </div>
                {cfg.showBestsellerBadge && product.is_bestseller && (
                  <div className="absolute top-2 right-2 z-20">
                    <Badge className="bg-success text-white text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5">
                      Mais Vendido
                    </Badge>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="p-3 pt-1.5 space-y-1 flex-1 flex flex-col">
            <h3 className="font-bold text-foreground text-sm leading-tight line-clamp-2">{productName}</h3>
            <p className="text-xs text-muted-foreground line-clamp-2">{subtitle}</p>
            <div className="flex items-center gap-1">
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className={`w-3 h-3 ${s <= 4 ? 'fill-primary text-primary' : 'text-muted-foreground/30'}`} />
                ))}
              </div>
              <span className="text-[10px] text-muted-foreground">(128)</span>
            </div>
            <div className="pt-1">
              {hasOffer && (
                <p className="text-muted-foreground text-xs line-through">
                  R$ {price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              )}
              <div className="flex items-baseline">
                <span className="text-foreground text-sm font-medium">R$</span>
                <span className="text-foreground text-2xl font-extrabold ml-1 leading-none">{integerPart}</span>
                <span className="text-foreground text-xs font-bold align-super ml-[1px]">,{decimalPart}</span>
              </div>
              {pixPercent > 0 && (
                <p className="text-success text-xs font-semibold mt-0.5">{pixPercent}% OFF no Pix</p>
              )}
            </div>
          </div>

          {cfg.showFreeShippingBanner && product.free_shipping && (
            <div className="mx-3 mb-1.5 px-2 py-1 flex items-center gap-1">
              <Truck className="w-3 h-3 text-success flex-shrink-0" />
              <span className="text-success text-[10px] font-semibold">Frete Grátis</span>
            </div>
          )}

          <div className={isB ? 'px-3 pb-3 pt-1 mt-auto' : 'px-3 pb-3 pt-0.5 mt-auto'}>
            <Button
              variant="outline"
              size={isB ? undefined : 'sm'}
              className={
                isB
                  ? 'w-full h-10 text-[13px] font-semibold border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground hover:border-primary'
                  : 'w-full text-xs'
              }
              type="button"
              onClick={handleCtaClick}
              title={`Abrir página real do produto: ${destinationLabel}`}
            >
              {isB ? (
                <>
                  <ShoppingCart className="w-4 h-4 mr-1.5" />
                  {cfg.ctaText}
                </>
              ) : (
                <>
                  <ShoppingCart className="w-3.5 h-3.5 mr-1" />
                  <span className="text-[11px]">{cfg.ctaText}</span>
                </>
              )}
            </Button>
            <p className="mt-1 text-[10px] text-muted-foreground flex items-center gap-1 justify-center">
              <ExternalLink className="w-2.5 h-2.5" />
              <span className="truncate">{destinationLabel}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function VariantEditor({
  variant,
  cfg,
  onChange,
}: {
  variant: 'A' | 'B';
  cfg: AbVariantConfig;
  onChange: (patch: Partial<AbVariantConfig>) => void;
}) {
  return (
    <div className="space-y-4 border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">
          Variante {variant} {variant === 'A' ? '(controle)' : '(conversão agressiva)'}
        </h3>
        <Badge variant={variant === 'B' ? 'default' : 'secondary'} className="text-[10px]">
          {variant === 'B' ? 'Novo' : 'Atual'}
        </Badge>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`cta-${variant}`} className="text-xs">Texto do botão (CTA)</Label>
        <Input
          id={`cta-${variant}`}
          value={cfg.ctaText}
          onChange={(e) => onChange({ ctaText: e.target.value })}
          placeholder="Adicionar ao Carrinho"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`badge-${variant}`} className="text-xs">
          Template do badge de desconto · use <code className="text-[10px]">{'{pct}'}</code> para o percentual
        </Label>
        <Input
          id={`badge-${variant}`}
          value={cfg.discountBadgeTemplate}
          onChange={(e) => onChange({ discountBadgeTemplate: e.target.value })}
          placeholder="-{pct}% OFF"
        />
      </div>

      <div className="space-y-2 pt-1">
        <ToggleRow
          label="Mostrar badge de oferta (-X%)"
          checked={cfg.showOfferBadge}
          onChange={(v) => onChange({ showOfferBadge: v })}
        />
        <ToggleRow
          label="Badge FRETE GRÁTIS sobre a imagem"
          checked={cfg.showFreeShippingImageBadge}
          onChange={(v) => onChange({ showFreeShippingImageBadge: v })}
        />
        <ToggleRow
          label="Faixa Frete Grátis abaixo do preço"
          checked={cfg.showFreeShippingBanner}
          onChange={(v) => onChange({ showFreeShippingBanner: v })}
        />
        <ToggleRow
          label="Mostrar selo Mais Vendido"
          checked={cfg.showBestsellerBadge}
          onChange={(v) => onChange({ showBestsellerBadge: v })}
        />
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function VariantPanel({
  label,
  tone,
  stats,
}: {
  label: string;
  tone: 'default' | 'primary';
  stats: Stats;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{label}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        <AdminKpiCard
          label="Sessões impactadas"
          value={stats.uniqueImpressions.toLocaleString('pt-BR')}
          icon={Eye}
          tone={tone}
          hint={`${stats.impressions.toLocaleString('pt-BR')} impressões totais`}
        />
        <AdminKpiCard
          label="Cliques únicos no CTA"
          value={stats.uniqueClicks.toLocaleString('pt-BR')}
          icon={MousePointerClick}
          tone={tone}
          hint={`${stats.clicks.toLocaleString('pt-BR')} cliques totais`}
        />
        <div className="col-span-2">
          <AdminKpiCard
            label="CTR (cliques únicos / sessões)"
            value={`${stats.ctr.toFixed(2)}%`}
            icon={TrendingUp}
            tone={tone}
          />
        </div>
      </CardContent>
    </Card>
  );
}