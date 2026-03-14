import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchProducts } from '@/lib/api';
import { WholesaleTier } from '@/contexts/CartContext';
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
import { Search, SlidersHorizontal, Package, CircleCheck, ShoppingCart, X, Layers, Star, Truck } from 'lucide-react';
import CountdownTimer from '@/components/CountdownTimer';
import { useCart } from '@/contexts/CartContext';
import productHeroImg from '@/assets/product-hero.png';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import BannerCarousel from '@/components/BannerCarousel';
import { useLanguage } from '@/contexts/LanguageContext';

const Catalog = () => {
  const { totalItems, addToCart } = useCart();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [wholesaleMap, setWholesaleMap] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [pharmaFilter, setPharmaFilter] = useState('all');
  const [routeFilter, setRouteFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [stockFilter, setStockFilter] = useState('all');
  const [reviewsMap, setReviewsMap] = useState<Record<string, { avg: number; count: number }>>({});

  useEffect(() => {
    fetchProducts()
      .then(async (prods) => {
        setProducts(prods);
        // Fetch which variations have wholesale prices
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
        // Fetch reviews for average ratings
        const productNames = prods.map((p: any) => p.name);
        if (productNames.length > 0) {
          const { data: revData } = await supabase
            .from('reviews')
            .select('product_name, rating')
            .in('product_name', productNames);
          const rMap: Record<string, { total: number; count: number }> = {};
          (revData || []).forEach((r: any) => {
            if (!rMap[r.product_name]) rMap[r.product_name] = { total: 0, count: 0 };
            rMap[r.product_name].total += r.rating;
            rMap[r.product_name].count += 1;
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
          p.active_ingredient?.toLowerCase().includes(q)
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
    <div className="min-h-screen bg-background">
      <Header />

      {/* Banner Carousel */}
      <BannerCarousel />

      {/* Hero */}
      <AnimatedSection variant="fadeUp" className="bg-gradient-to-b from-primary/5 to-transparent py-12 text-center">
        <div className="max-w-3xl mx-auto px-4">
          <h1 className="text-4xl font-bold text-foreground mb-3">{t('catalogTitle')}</h1>
          <p className="text-muted-foreground text-lg">{t('catalogSubtitle')}</p>
        </div>
      </AnimatedSection>

      <div className="max-w-7xl mx-auto px-4 py-8">
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

            <div className="grid grid-cols-2 md:flex gap-2">
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
          <div className="text-center py-20 text-muted-foreground">{t('loadingProducts')}</div>
        ) : flatItems.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <Package className="w-12 h-12 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">{t('noProducts')}</p>
            <Button variant="outline" onClick={() => { setSearch(''); setPharmaFilter('all'); setRouteFilter('all'); setStockFilter('all'); }}>
              {t('clearFilters')}
            </Button>
          </div>
        ) : (
          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {flatItems.map(({ product, variation }, idx) => {
              const price = variation ? Number(variation.price) : null;
              const offerPrice = variation?.is_offer && variation?.offer_price ? Number(variation.offer_price) : null;
              const inStock = variation ? variation.in_stock : false;
              const offer = variation ? variation.is_offer : false;
              const img = variation?.images?.[0] || variation?.image_url || product.images?.[0] || productHeroImg;
              const hasWholesale = variation ? (variation.id in wholesaleMap) : false;
              const wholesaleMinQty = variation ? wholesaleMap[variation.id] : undefined;
              const displayName = variation?.dosage && !product.name.toLowerCase().includes(variation.dosage.toLowerCase())
                ? `${product.name} ${variation.dosage}`
                : product.name;

              const displayPrice = offerPrice || price;
              const pixDiscount = displayPrice ? Math.round(displayPrice * 0.81 * 100) / 100 : null;
              const pixPercent = 19;
              const formatPriceParts = (val: number) => {
                const [intPart, decPart] = val.toFixed(2).split('.');
                return { intPart: Number(intPart).toLocaleString('pt-BR'), decPart };
              };

              return (
                <StaggerItem key={variation?.id || `${product.id}-${idx}`}>
                  <div className={`group rounded-xl border overflow-hidden hover:shadow-lg transition-all duration-300 flex flex-col ${product.is_bestseller ? 'border-success/30 bg-success/[0.08] hover:border-success/50' : 'border-border/50 bg-card hover:border-primary/30'}`}>
                    <Link
                      to={`/produto/${product.id}${variation ? `?v=${variation.id}` : ''}`}
                      className="block flex-1"
                    >
                      {/* Image */}
                      <div className="relative aspect-square bg-white flex items-center justify-center p-6 overflow-hidden">
                        <img
                          src={img}
                          alt={displayName}
                          className="max-w-[80%] max-h-[80%] object-contain group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                          {offer && offerPrice && price && (
                            <Badge className="bg-destructive text-destructive-foreground text-[10px] font-bold">
                              -{Math.round(((price - offerPrice) / price) * 100)}%
                            </Badge>
                          )}
                          {!inStock && (
                            <Badge variant="secondary" className="text-[10px]">{t('outOfStock')}</Badge>
                          )}
                        </div>
                        <div className="absolute top-3 right-3 flex flex-col gap-1.5 items-end">
                          {hasWholesale && (
                            <Badge className="bg-primary/90 text-primary-foreground text-[10px] font-bold gap-1">
                              <Layers className="w-3 h-3" /> Atacado
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Mais Vendido badge below image */}
                      {product.is_bestseller && (
                        <div className="px-4 pt-3">
                          <Badge className="bg-success text-white text-[10px] font-bold uppercase tracking-wide px-2 py-0.5">
                            Mais Vendido
                          </Badge>
                        </div>
                      )}

                      {/* Content */}
                      <div className="p-4 pt-2 space-y-1.5">
                        <h3 className="font-bold text-foreground text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                          {variation?.dosage && !product.name.toLowerCase().includes(variation.dosage.toLowerCase())
                            ? `${product.name} ${variation.dosage}`
                            : product.name}
                        </h3>

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
                            <div className="flex items-baseline">
                              <span className="text-foreground text-sm font-medium">R$</span>
                              <span className="text-foreground text-2xl font-extrabold ml-1 leading-none">
                                {formatPriceParts(displayPrice!).intPart}
                              </span>
                              <span className="text-foreground text-xs font-bold align-super ml-[1px]">
                                {formatPriceParts(displayPrice!).decPart}
                              </span>
                            </div>
                            {pixDiscount && (
                              <>
                                <p className="text-success text-xs font-semibold mt-0.5">
                                  {pixPercent}% OFF no Pix
                                </p>
                                <p className="text-muted-foreground text-[11px]">
                                  ou R$ {displayPrice!.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em outros meios
                                </p>
                              </>
                            )}
                            {/* Installments */}
                            {displayPrice && displayPrice > 10 && (
                              <p className="text-muted-foreground text-[11px]">
                                ou R$ {displayPrice!.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em{' '}
                                <span className="text-primary font-medium">
                                  {(() => {
                                    const maxInstallments = Math.min(6, Math.floor(displayPrice! / 5));
                                    const installmentValue = displayPrice! / Math.max(maxInstallments, 1);
                                    return `${maxInstallments}x R$ ${installmentValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} sem juros`;
                                  })()}
                                </span>
                              </p>
                            )}
                            {offerPrice && <CountdownTimer variant="compact" />}
                          </div>
                        ) : (
                          <p className="text-muted-foreground text-sm">{t('consult')}</p>
                        )}

                        {hasWholesale && wholesaleMinQty && (
                          <div className="pt-0.5">
                            <Badge variant="outline" className="text-[10px] text-primary border-primary/30 font-bold gap-1">
                              <Layers className="w-3 h-3" /> Atacado a partir de {wholesaleMinQty} unid.
                            </Badge>
                          </div>
                        )}
                      </div>
                    </Link>

                    {/* Free Shipping Banner */}
                    {product.free_shipping && (
                      <div className="mx-4 mb-2 rounded-md bg-success/10 border border-success/20 px-3 py-1.5 flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5 text-success flex-shrink-0" />
                        <span className="text-success text-[11px] font-semibold">Frete Grátis</span>
                      </div>
                    )}

                    {/* Add to Cart Button */}
                    {variation && inStock && (
                      <div className="px-4 pb-4 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs"
                          onClick={async (e) => {
                            e.stopPropagation();
                            const { data: { session } } = await supabase.auth.getSession();
                            if (!session) {
                              navigate(`/cliente/login?redirect=${encodeURIComponent('/catalogo')}`);
                              return;
                            }
                            addToCart(product.id, variation.id, 1);
                          }}
                        >
                          <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />
                          Adicionar ao Carrinho
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
