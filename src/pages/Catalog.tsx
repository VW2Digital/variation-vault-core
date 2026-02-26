import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { fetchProducts } from '@/lib/api';
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
import { Search, SlidersHorizontal, Package } from 'lucide-react';
import productHeroImg from '@/assets/product-hero.png';

const Catalog = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pharmaFilter, setPharmaFilter] = useState('all');
  const [routeFilter, setRouteFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [stockFilter, setStockFilter] = useState('all');

  useEffect(() => {
    fetchProducts()
      .then(setProducts)
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

    if (pharmaFilter !== 'all') {
      result = result.filter((p) => p.pharma_form === pharmaFilter);
    }

    if (routeFilter !== 'all') {
      result = result.filter((p) => p.administration_route === routeFilter);
    }

    if (stockFilter !== 'all') {
      result = result.filter((p) => {
        const hasStock = p.product_variations?.some((v: any) => v.in_stock);
        return stockFilter === 'in_stock' ? hasStock : !hasStock;
      });
    }

    if (sortBy === 'newest') {
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortBy === 'name_asc') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'price_asc') {
      const minPrice = (p: any) => Math.min(...(p.product_variations?.map((v: any) => Number(v.price)) || [Infinity]));
      result.sort((a, b) => minPrice(a) - minPrice(b));
    } else if (sortBy === 'price_desc') {
      const minPrice = (p: any) => Math.min(...(p.product_variations?.map((v: any) => Number(v.price)) || [0]));
      result.sort((a, b) => minPrice(b) - minPrice(a));
    }

    return result;
  }, [products, search, pharmaFilter, routeFilter, stockFilter, sortBy]);

  // Flatten products into one entry per variation
  const flatItems = useMemo(() => {
    return filtered.flatMap((product) => {
      const variations = product.product_variations || [];
      if (variations.length === 0) {
        return [{ product, variation: null }];
      }
      return variations.map((v: any) => ({ product, variation: v }));
    });
  }, [filtered]);
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-lg font-bold text-primary tracking-tight">
            LIBERTY PHARMA
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/catalogo" className="text-foreground font-medium">Catálogo</Link>
            <span className="text-muted-foreground">🌐 BR</span>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <AnimatedSection variant="fadeUp" className="bg-gradient-to-b from-primary/5 to-transparent py-12 text-center">
        <div className="max-w-3xl mx-auto px-4">
          <h1 className="text-4xl font-bold text-foreground mb-3">Catálogo de Produtos</h1>
          <p className="text-muted-foreground text-lg">
            Explore nossa linha completa de medicamentos com qualidade premium e certificação internacional.
          </p>
        </div>
      </AnimatedSection>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Filters Bar */}
        <AnimatedSection variant="fadeIn" className="mb-8">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, princípio ativo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              <Select value={pharmaFilter} onValueChange={setPharmaFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Forma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as formas</SelectItem>
                  {pharmaForms.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={routeFilter} onValueChange={setRouteFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Via" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as vias</SelectItem>
                  {adminRoutes.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={stockFilter} onValueChange={setStockFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Estoque" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="in_stock">Em estoque</SelectItem>
                  <SelectItem value="out_of_stock">Esgotado</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[160px]">
                  <SlidersHorizontal className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Ordenar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Mais recentes</SelectItem>
                  <SelectItem value="name_asc">Nome A-Z</SelectItem>
                  <SelectItem value="price_asc">Menor preço</SelectItem>
                  <SelectItem value="price_desc">Maior preço</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-sm text-muted-foreground mt-3">
            {flatItems.length} {flatItems.length === 1 ? 'produto encontrado' : 'produtos encontrados'}
          </p>
        </AnimatedSection>

        {/* Product Grid */}
        {loading ? (
          <div className="text-center py-20 text-muted-foreground">Carregando produtos...</div>
        ) : flatItems.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <Package className="w-12 h-12 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">Nenhum produto encontrado com os filtros selecionados.</p>
            <Button variant="outline" onClick={() => { setSearch(''); setPharmaFilter('all'); setRouteFilter('all'); setStockFilter('all'); }}>
              Limpar filtros
            </Button>
          </div>
        ) : (
          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {flatItems.map(({ product, variation }, idx) => {
              const price = variation ? Number(variation.price) : null;
              const inStock = variation ? variation.in_stock : false;
              const offer = variation ? variation.is_offer : false;
              const img = variation?.images?.[0] || variation?.image_url || product.images?.[0] || productHeroImg;
              const displayName = variation
                ? `${product.name} ${variation.dosage}`
                : product.name;

              return (
                <StaggerItem key={variation?.id || `${product.id}-${idx}`}>
                  <Link
                    to={`/produto/${product.id}${variation ? `?v=${variation.id}` : ''}`}
                    className="group block rounded-xl border border-border/50 bg-card overflow-hidden hover:shadow-lg hover:border-primary/30 transition-all duration-300"
                  >
                    <div className="relative aspect-square bg-muted/30 flex items-center justify-center p-6 overflow-hidden">
                      <img
                        src={img}
                        alt={displayName}
                        className="max-w-[75%] max-h-[75%] object-contain group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                        {offer && (
                          <Badge className="bg-destructive text-destructive-foreground text-[10px] font-bold">
                            OFERTA
                          </Badge>
                        )}
                        {!inStock && (
                          <Badge variant="secondary" className="text-[10px]">Esgotado</Badge>
                        )}
                      </div>
                    </div>

                    <div className="p-4 space-y-2">
                      <h3 className="font-semibold text-foreground text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                        {displayName}
                      </h3>
                      {product.subtitle && (
                        <p className="text-xs text-muted-foreground line-clamp-1">{product.subtitle}</p>
                      )}
                      {product.active_ingredient && (
                        <p className="text-[11px] text-muted-foreground">
                          Princípio ativo: <span className="font-medium">{product.active_ingredient}</span>
                        </p>
                      )}
                      <div className="flex items-center justify-between pt-1">
                        {price !== null ? (
                          <p className="text-primary font-bold text-lg">
                            R$ {price.toLocaleString('pt-BR')}
                          </p>
                        ) : (
                          <p className="text-muted-foreground text-sm">Consultar</p>
                        )}
                        {inStock && (
                          <span className="text-[10px] text-success font-medium">● Em estoque</span>
                        )}
                      </div>
                    </div>
                  </Link>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-card mt-12">
        <div className="max-w-7xl mx-auto px-4 py-8 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Liberty Pharma — Todos os direitos reservados</p>
        </div>
      </footer>
    </div>
  );
};

export default Catalog;
