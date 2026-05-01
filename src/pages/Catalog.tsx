import { useState, useEffect, useMemo, useRef } from 'react';
import { gtagViewItemList } from '@/lib/gtag';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchProducts, fetchSetting } from '@/lib/api';
import { WholesaleTier } from '@/contexts/CartContext';
import { calcularParcelamento, parseInterestTable } from '@/lib/installments';
import { supabase } from '@/integrations/supabase/client';
import { AnimatedSection, StaggerContainer, StaggerItem } from '@/components/AnimatedSection';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, SlidersHorizontal, Package, CircleCheck, ShoppingCart, X, Layers, Star, Truck, ShieldCheck, CreditCard, Shield } from 'lucide-react';
import CountdownTimer from '@/components/CountdownTimer';
import { useCart } from '@/contexts/CartContext';
import productHeroImg from '@/assets/product-hero.png';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import BannerCarousel from '@/components/BannerCarousel';
import { useLanguage } from '@/contexts/LanguageContext';
import { TRUST_BAR_ICONS, DEFAULT_TRUST_BAR, DEFAULT_TRUST_BAR_BG, DEFAULT_TRUST_BAR_SPEED, type TrustBarItem } from '@/pages/settings/SettingsTrustBar';
import { ProductCardSkeletonGrid } from '@/components/ProductCardSkeleton';
import { getAbContext, trackAbEvent } from '@/lib/abTest';
import ProductCardImageCarousel from '@/components/ProductCardImageCarousel';

const Catalog = () => {
  const { totalItems, addToCart } = useCart();
  // A/B test do card de produto
  const ab = useMemo(() => getAbContext(), []);
  const impressionsLogged = useRef<Set<string>>(new Set());
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [wholesaleMap, setWholesaleMap] = useState<Record<string, number>>({});
  const [search, setSearch] = useState(searchParams.get('busca') || '');

  // Sync search state with URL params
  useEffect(() => {
    const busca = searchParams.get('busca') || '';
    setSearch(busca);
  }, [searchParams]);
  const [pharmaFilter, setPharmaFilter] = useState('all');
  const [routeFilter, setRouteFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [stockFilter, setStockFilter] = useState('all');
  const [reviewsMap, setReviewsMap] = useState<Record<string, { avg: number; count: number }>>({});
  const [interestTable, setInterestTable] = useState<Record<number, number>>({});
  const [trustBarItems, setTrustBarItems] = useState<TrustBarItem[]>(DEFAULT_TRUST_BAR);
  const [trustBarBg, setTrustBarBg] = useState<string>(DEFAULT_TRUST_BAR_BG);
  const [trustBarSpeed, setTrustBarSpeed] = useState<number>(DEFAULT_TRUST_BAR_SPEED);

  useEffect(() => {
    fetchSetting('trust_bar_items').then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) setTrustBarItems(parsed);
      } catch {
        // keep defaults
      }
    });
    fetchSetting('trust_bar_bg').then((raw) => { if (raw) setTrustBarBg(raw); });
    fetchSetting('trust_bar_speed').then((raw) => {
      if (!raw) return;
      const n = Number(raw);
      if (!Number.isNaN(n) && n >= 5 && n <= 120) setTrustBarSpeed(n);
    });
  }, []);

  useEffect(() => {
    // Load interest table (still global)
    fetchSetting('interest_table').then((intTable) => {
      setInterestTable(parseInterestTable(intTable));
    });

    fetchProducts(true)
      .then(async (prods) => {
        setProducts(prods);
        // Google Ads: view_item_list
        gtagViewItemList(prods.map((p: any) => {
          const v = p.product_variations?.[0];
          const price = v?.is_offer && v?.offer_price ? Number(v.offer_price) : Number(v?.price || 0);
          return { id: p.id, name: p.name, category: p.category || '', price };
        }));
        const allVarIds = prods.flatMap((p: any) => (p.product_variations || []).map((v: any) => v.id));
        if (allVarIds.length > 0) {
          const { data: wpData } = await supabase
            .from('wholesale_prices')
            .select('variation_id, min_quantity')
            .in('variation_id', allVarIds)
            .order('min_quantity', { ascending: true });
          const wpSet: Record<string, number> = {};
          (wpData || []).forEach((w: any) => {
            if (!(w.variation_id in wpSet) || w.min_quantity < wpSet[w.variation_id]) {
              wpSet[w.variation_id] = w.min_quantity;
            }
          });
          setWholesaleMap(wpSet);
        }
        // Fetch reviews for average ratings.
        // Pedidos salvam product_name com dosagem/quantidade, então agrupamos
        // pelo nome base do produto via prefix match (case-insensitive).
        const productNames = prods.map((p: any) => p.name).filter(Boolean);
        if (productNames.length > 0) {
          const { data: revData } = await supabase
            .from('reviews')
            .select('product_name, rating');
          const rMap: Record<string, { total: number; count: number }> = {};
          (revData || []).forEach((r: any) => {
            const reviewName = (r.product_name || '').toLowerCase();
            const match = productNames.find((pn: string) =>
              reviewName === pn.toLowerCase() || reviewName.startsWith(pn.toLowerCase())
            );
            if (!match) return;
            if (!rMap[match]) rMap[match] = { total: 0, count: 0 };
            rMap[match].total += r.rating;
            rMap[match].count += 1;
          });
          const finalMap: Record<string, { avg: number; count: number }> = {};
          Object.entries(rMap).forEach(([name, { total, count }]) => {
            finalMap[name] = { avg: total / count, count };
          });
          setReviewsMap(finalMap);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const pharmaForms = useMemo(
    () => [...new Set(products.map((p) => p.pharma_form).filter(Boolean))],
    [products]
  );

  const adminRoutes = useMemo(
    () => [...new Set(products.map((p) => p.administration_route).filter(Boolean))],
    [products]
  );

  const filtered = useMemo(() => {
    let result = [...products];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.subtitle?.toLowerCase().includes(q) ||
          p.active_ingredient?.toLowerCase().includes(q) ||
          p.product_variations?.some((v: any) =>
            v.dosage?.toLowerCase().includes(q) ||
            v.subtitle?.toLowerCase().includes(q)
          )
      );
    }

    if (pharmaFilter !== 'all') result = result.filter((p) => p.pharma_form === pharmaFilter);
    if (routeFilter !== 'all') result = result.filter((p) => p.administration_route === routeFilter);

    if (stockFilter === 'in_stock') {
      result = result.filter((p) => p.product_variations?.some((v: any) => v.in_stock));
    } else if (stockFilter === 'out_of_stock') {
      result = result.filter((p) => !p.product_variations?.some((v: any) => v.in_stock));
    }

    return result;
  }, [products, search, pharmaFilter, routeFilter, stockFilter]);

  const flatItems = useMemo(() => {
    let items = filtered.flatMap((product) => {
      const vars = product.product_variations || [];
      if (vars.length === 0) return [{ product, variation: null }];
      return vars.map((variation: any) => ({ product, variation }));
    });

    if (sortBy === 'name_asc') items.sort((a, b) => a.product.name.localeCompare(b.product.name));
    else if (sortBy === 'price_asc') items.sort((a, b) => (a.variation?.price ?? 0) - (b.variation?.price ?? 0));
    else if (sortBy === 'price_desc') items.sort((a, b) => (b.variation?.price ?? 0) - (a.variation?.price ?? 0));
    else items.sort((a, b) => new Date(b.product.created_at).getTime() - new Date(a.product.created_at).getTime());

    return items;
  }, [filtered, sortBy]);

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <Header />

      {/* Banner Carousel */}
      <BannerCarousel />

      {/* Trust Bar - Marquee */}
      <div className="border-b border-border/30 overflow-hidden" style={{ background: trustBarBg }}>
        <div className="py-3">
          <div className="flex animate-marquee whitespace-nowrap" style={{ animationDuration: `${trustBarSpeed}s` }}>
            {[...Array(2)].map((_, repeat) => (
              <div key={repeat} className="flex items-center shrink-0">
                <span className="text-border mx-4 md:mx-8 text-lg">|</span>
                {trustBarItems.map((item, i) => {
                  const Icon = TRUST_BAR_ICONS[item.icon] ?? ShieldCheck;
                  const iconColor = item.color || undefined;
                  return (
                    <div key={`${repeat}-${i}-${item.title}`} className="flex items-center shrink-0">
                      {i > 0 && <span className="text-border mx-4 md:mx-8 text-lg">|</span>}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="bg-card rounded-lg p-2 shrink-0 shadow-sm">
                          <Icon className={iconColor ? 'w-5 h-5' : 'w-5 h-5 text-primary'} style={iconColor ? { color: iconColor } : undefined} />
                        </div>
                        <div className="whitespace-nowrap">
                          <p className="text-xs font-bold text-foreground uppercase leading-tight">{item.title}</p>
                          <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{item.desc}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Hero */}
      <AnimatedSection variant="fadeUp" className="bg-gradient-to-b from-primary/5 to-transparent py-12 text-center">
        <div className="max-w-3xl mx-auto px-4">
          <h1 className="text-4xl font-bold text-foreground mb-3">{t('catalogTitle')}</h1>
          <p className="text-muted-foreground text-lg">{t('catalogSubtitle')}</p>
        </div>
      </AnimatedSection>

      <div className="max-w-7xl mx-auto px-[5px] py-8">
        {/* Filters Bar */}
        <AnimatedSection variant="fadeIn" className="mb-8">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t('searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="grid grid-cols-2 md:flex gap-2 w-full md:w-auto">
              <Select value={pharmaFilter} onValueChange={setPharmaFilter}>
                <SelectTrigger className="md:w-[160px]">
                  <SelectValue placeholder={t('allForms')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('allForms')}</SelectItem>
                  {pharmaForms.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={routeFilter} onValueChange={setRouteFilter}>
                <SelectTrigger className="md:w-[160px]">
                  <SelectValue placeholder={t('allRoutes')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('allRoutes')}</SelectItem>
                  {adminRoutes.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={stockFilter} onValueChange={setStockFilter}>
                <SelectTrigger className="md:w-[150px]">
                  <SelectValue placeholder={t('all')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('all')}</SelectItem>
                  <SelectItem value="in_stock">{t('inStock')}</SelectItem>
                  <SelectItem value="out_of_stock">{t('outOfStock')}</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="md:w-[160px]">
                  <SlidersHorizontal className="w-4 h-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">{t('newest')}</SelectItem>
                  <SelectItem value="name_asc">{t('nameAZ')}</SelectItem>
                  <SelectItem value="price_asc">{t('priceLow')}</SelectItem>
                  <SelectItem value="price_desc">{t('priceHigh')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between mt-3">
            <p className="text-sm text-muted-foreground">
              {flatItems.length} {flatItems.length === 1 ? t('productFound') : t('productsFound')}
            </p>
            {(search || pharmaFilter !== 'all' || routeFilter !== 'all' || stockFilter !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSearch(''); setPharmaFilter('all'); setRouteFilter('all'); setStockFilter('all'); }}
                className="text-xs text-muted-foreground hover:text-destructive gap-1"
              >
                <X className="w-3 h-3" /> Limpar filtros
              </Button>
            )}
          </div>
        </AnimatedSection>

        {/* Product Grid */}
        {loading ? (
          <ProductCardSkeletonGrid count={8} />
        ) : flatItems.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <Package className="w-12 h-12 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">{t('noProducts')}</p>
            <Button variant="outline" onClick={() => { setSearch(''); setPharmaFilter('all'); setRouteFilter('all'); setStockFilter('all'); }}>
              {t('clearFilters')}
            </Button>
          </div>
        ) : (
          <StaggerContainer className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1.5 sm:gap-2.5">
            {flatItems.map(({ product, variation }, idx) => {
              const price = variation ? Number(variation.price) : null;
              const offerPrice = variation?.is_offer && variation?.offer_price ? Number(variation.offer_price) : null;
              const inStock = variation ? variation.in_stock : false;
              const offer = variation ? variation.is_offer : false;
              const imageList: string[] = (() => {
                const fromVariation = Array.isArray(variation?.images) ? variation.images.filter(Boolean) : [];
                if (fromVariation.length > 0) return fromVariation;
                if (variation?.image_url) return [variation.image_url];
                const fromProduct = Array.isArray(product.images) ? product.images.filter(Boolean) : [];
                if (fromProduct.length > 0) return fromProduct;
                return [productHeroImg];
              })();
              const hasWholesale = variation ? (variation.id in wholesaleMap) : false;
              const wholesaleMinQty = variation ? wholesaleMap[variation.id] : undefined;
              const displayName = variation?.dosage
                && !variation?.is_digital
                && !product.name.toLowerCase().includes(variation.dosage.toLowerCase())
                ? `${product.name} ${variation.dosage}`
                : product.name;

              const pixPercentSetting = Number((product as any).pix_discount_percent) || 0;
              const maxInstallmentsSetting = Number((product as any).max_installments) || 6;
              const installmentsInterest = (product as any).installments_interest || 'sem_juros';
              const displayPrice = offerPrice || price;
              const pixDiscount = displayPrice && pixPercentSetting > 0 ? Math.round(displayPrice * (1 - pixPercentSetting / 100) * 100) / 100 : null;
              const pixPercent = pixPercentSetting;
              const formatPriceParts = (val: number) => {
                const [intPart, decPart] = val.toFixed(2).split('.');
                return { intPart: Number(intPart).toLocaleString('pt-BR'), decPart };
              };

              return (
                <StaggerItem key={variation?.id || `${product.id}-${idx}`}>
                  <div
                    data-ab-variant={ab.variant}
                    ref={(el) => {
                      if (!el) return;
                      const key = `${ab.variant}:${variation?.id || product.id}`;
                      if (impressionsLogged.current.has(key)) return;
                      impressionsLogged.current.add(key);
                      trackAbEvent(ab.variant, 'impression', product.id, variation?.id ?? null, ab.enabled);
                    }}
                    className={`group rounded-xl border overflow-hidden transition-all duration-300 flex flex-col h-full ${
                      ab.variant === 'B' ? 'hover:shadow-xl hover:-translate-y-0.5' : 'hover:shadow-lg'
                    } ${product.is_bestseller ? 'border-success/40 bg-success/[0.06] hover:border-success/60' : 'border-border/50 bg-card hover:border-primary/40'}`}
                  >
                    <Link
                      to={`/produto/${product.id}${variation ? `?v=${variation.id}` : ''}`}
                      className="block flex-1"
                    >
                      {/* Image */}
                      <div className={`relative aspect-[1080/1450] bg-white overflow-hidden ${ab.variant === 'B' ? 'border-b border-border/40' : ''}`}>
                        <ProductCardImageCarousel
                          images={imageList}
                          alt={displayName}
                          imageInset="8%"
                          imgClassName="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
                        />
                        {ab.variant === 'B' ? (
                          <>
                            <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
                              {offer && offerPrice && price && (
                                <Badge className="bg-destructive text-destructive-foreground text-[11px] sm:text-xs font-extrabold px-2 py-0.5 shadow-md shadow-destructive/30 rounded-md">
                                  -{Math.round(((price - offerPrice) / price) * 100)}% OFF
                                </Badge>
                              )}
                              {product.free_shipping && (
                                <Badge className="bg-success text-white text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 shadow-sm gap-0.5 rounded-md">
                                  <Truck className="w-2.5 h-2.5" />
                                  FRETE GRÁTIS
                                </Badge>
                              )}
                              {!inStock && (
                                <Badge variant="secondary" className="text-[10px]">{t('outOfStock')}</Badge>
                              )}
                            </div>
                            <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                              {product.is_bestseller && (
                                <Badge className="bg-warning text-white text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 shadow-md rounded-md">
                                  Mais Vendido
                                </Badge>
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="absolute top-2 left-2 flex flex-col gap-1">
                              {offer && offerPrice && price && (
                                <Badge className="bg-destructive text-destructive-foreground text-[10px] font-bold">
                                  -{Math.round(((price - offerPrice) / price) * 100)}%
                                </Badge>
                              )}
                              {!inStock && (
                                <Badge variant="secondary" className="text-[10px]">{t('outOfStock')}</Badge>
                              )}
                            </div>
                            <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                              {product.is_bestseller && (
                                <Badge className="bg-success text-white text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5">
                                  Mais Vendido
                                </Badge>
                              )}
                            </div>
                          </>
                        )}
                        {hasWholesale && wholesaleMinQty && (
                          <div className="absolute bottom-2 left-2">
                            <Badge variant="outline" className="bg-background/80 backdrop-blur-sm text-[9px] text-primary border-primary/30 font-bold gap-0.5 px-1.5">
                              <Layers className="w-2.5 h-2.5" /> Atacado a partir de {wholesaleMinQty} unid.
                            </Badge>
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="p-3 pt-1.5 space-y-1 flex-1 flex flex-col">
                        <h3 className="font-bold text-foreground text-xs sm:text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                          {displayName}
                        </h3>

                        {(variation?.subtitle || product.subtitle) && (
                          <p className="text-[10px] sm:text-xs text-muted-foreground line-clamp-2">
                            {variation?.subtitle || product.subtitle}
                          </p>
                        )}

                        {reviewsMap[product.name] && (
                          <div className="flex items-center gap-1">
                            <div className="flex gap-0.5">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <Star
                                  key={s}
                                  className={`w-3 h-3 ${s <= Math.round(reviewsMap[product.name].avg) ? 'fill-primary text-primary' : 'text-muted-foreground/30'}`}
                                />
                              ))}
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              ({reviewsMap[product.name].count})
                            </span>
                          </div>
                        )}

                        {/* Pricing */}
                        {price !== null ? (
                          <div className="pt-1">
                            {offerPrice ? (
                              <p className="text-muted-foreground text-xs line-through">
                                R$ {price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                            ) : null}
                            <div className="flex items-baseline flex-wrap">
                              <span className="text-foreground text-xs sm:text-sm font-medium">R$</span>
                              <span className="text-foreground text-lg sm:text-2xl font-extrabold ml-1 leading-none">
                                {formatPriceParts(displayPrice!).intPart}
                              </span>
                              <span className="text-foreground text-[10px] sm:text-xs font-bold align-super ml-[1px]">
                                {formatPriceParts(displayPrice!).decPart}
                              </span>
                            </div>
                            {pixDiscount && (
                              <>
                                <p className="text-success text-[10px] sm:text-xs font-semibold mt-0.5">
                                  {pixPercent}% OFF no Pix
                                </p>
                              </>
                            )}
                            {/* Installments */}
                            {displayPrice && displayPrice > 10 && maxInstallmentsSetting > 1 && (
                              <p className="text-muted-foreground text-[10px] sm:text-[11px] hidden sm:block">
                                {(() => {
                                  const maxInst = Math.min(maxInstallmentsSetting, Math.floor(displayPrice! / 5));
                                  const effectiveMax = Math.max(maxInst, 1);
                                  if (installmentsInterest === 'sem_juros') {
                                    const installmentValue = displayPrice! / effectiveMax;
                                    return <>ou R$ {displayPrice!.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em{' '}
                                      <span className="text-primary font-medium">
                                        {effectiveMax}x R$ {installmentValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} sem juros
                                      </span>
                                    </>;
                                  } else {
                                    const result = calcularParcelamento(displayPrice!, effectiveMax, interestTable);
                                    return <>ou R$ {result.valorFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em{' '}
                                      <span className="text-primary font-medium">
                                        {effectiveMax}x R$ {result.valorParcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                      </span>
                                    </>;
                                  }
                                })()}
                              </p>
                            )}
                            {offerPrice && <CountdownTimer variant="compact" />}
                          </div>
                        ) : (
                          <p className="text-muted-foreground text-sm">{t('consult')}</p>
                        )}

                        <div className="flex-1" /> {/* Spacer to push buttons down */}
                      </div>
                    </Link>

                    {/* Free Shipping Banner — apenas variante A */}
                    {ab.variant === 'A' && product.free_shipping && (
                      <div className="mx-3 mb-1.5 rounded-md bg-transparent border border-transparent px-2 py-1 flex items-center gap-1">
                        <Truck className="w-3 h-3 text-success flex-shrink-0" />
                        <span className="text-success text-[10px] font-semibold">Frete Grátis</span>
                      </div>
                    )}

                    {/* Add to Cart Button */}
                    {variation && inStock && (
                      <div className={ab.variant === 'B' ? 'px-3 pb-3 pt-1 mt-auto' : 'px-3 pb-3 pt-0.5 mt-auto'}>
                        <Button
                          variant="outline"
                          size={ab.variant === 'B' ? undefined : 'sm'}
                          className={
                            ab.variant === 'B'
                              ? 'w-full h-9 sm:h-10 text-[12px] sm:text-[13px] font-semibold border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors'
                              : 'w-full text-xs'
                          }
                          onClick={async (e) => {
                            e.stopPropagation();
                            trackAbEvent(ab.variant, 'cta_click', product.id, variation.id, ab.enabled);
                            const minQty = wholesaleMap[variation.id] || 1;
                            addToCart(product.id, variation.id, minQty);
                          }}
                        >
                          {ab.variant === 'B' ? (
                            <>
                              <ShoppingCart className="w-4 h-4 mr-1.5" />
                              Adicionar ao Carrinho
                            </>
                          ) : (
                            <>
                              <ShoppingCart className="w-3.5 h-3.5 mr-1" />
                              <span className="text-[11px]">Adicionar ao Carrinho</span>
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        )}
      </div>

      <Footer />
    </div>
  );
};

export default Catalog;
