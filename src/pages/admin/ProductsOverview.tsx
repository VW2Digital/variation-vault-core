import { useEffect, useMemo, useState } from 'react';
import { fetchProducts } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Package, Tag, Star, ArrowUpRight, ChevronsUpDown, MoreVertical,
  Search, Plus, Bell, Award, TrendingUp,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface Variation {
  id?: string;
  price?: number;
  offer_price?: number;
  image_url?: string;
  images?: string[];
  in_stock?: boolean;
  stock_quantity?: number;
}

interface Product {
  id: string;
  name: string;
  category?: string;
  active?: boolean;
  created_at?: string;
  product_variations?: Variation[];
}

interface OrderRow {
  product_name: string | null;
  total_value: number | null;
  status: string;
  created_at: string;
}

interface ReviewRow {
  product_name: string;
  rating: number;
}

const CONFIRMED = ['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH', 'PAID'];

const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
const shortBRL = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(1)}k`;
  return formatBRL(v);
};
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

function getImage(p: Product): string | null {
  for (const v of p.product_variations || []) {
    if (v.image_url) return v.image_url;
    if (v.images && v.images.length > 0) return v.images[0];
  }
  return null;
}
function getMinPrice(p: Product): number {
  const prices = (p.product_variations || [])
    .map((v) => Number(v.offer_price && v.offer_price > 0 ? v.offer_price : v.price) || 0)
    .filter((n) => n > 0);
  return prices.length === 0 ? 0 : Math.min(...prices);
}

/**
 * Visão de produtos no estilo da referência: KPIs, Top Categorias (donut),
 * Engajamento (line chart), tabela "All Products" e card "Top Produto".
 * Usa paleta dourada Liberty.
 */
export default function ProductsOverview() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'rating' | 'rate' | 'price'>('rate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    (async () => {
      const ps = await fetchProducts();
      setProducts(ps as any);
      const { data: ords } = await supabase
        .from('orders')
        .select('product_name, total_value, status, created_at');
      setOrders((ords as OrderRow[]) || []);
      const { data: revs } = await supabase
        .from('reviews')
        .select('product_name, rating');
      setReviews((revs as ReviewRow[]) || []);
      setLoading(false);
    })();
  }, []);

  // Total categorias
  const totalCategories = useMemo(() => {
    const s = new Set(products.map((p) => p.category || 'Sem categoria'));
    return s.size;
  }, [products]);

  // Vendas por produto (somente confirmados)
  const salesByProduct = useMemo(() => {
    const map = new Map<string, { qty: number; revenue: number }>();
    orders.forEach((o) => {
      if (!CONFIRMED.includes(o.status)) return;
      const key = o.product_name || '';
      if (!key) return;
      const cur = map.get(key) || { qty: 0, revenue: 0 };
      cur.qty += 1;
      cur.revenue += Number(o.total_value || 0);
      map.set(key, cur);
    });
    return map;
  }, [orders]);

  // Reviews por produto
  const ratingsByProduct = useMemo(() => {
    const map = new Map<string, { sum: number; count: number }>();
    reviews.forEach((r) => {
      const key = r.product_name || '';
      const cur = map.get(key) || { sum: 0, count: 0 };
      cur.sum += Number(r.rating || 0);
      cur.count += 1;
      map.set(key, cur);
    });
    return map;
  }, [reviews]);

  // Top categorias (por receita)
  const topCategories = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach((p) => {
      const cat = p.category || 'Sem categoria';
      const sales = salesByProduct.get(p.name);
      if (!sales) return;
      map.set(cat, (map.get(cat) || 0) + sales.revenue);
    });
    const total = Array.from(map.values()).reduce((s, v) => s + v, 0);
    const list = Array.from(map.entries())
      .map(([name, value]) => ({ name, value, pct: total > 0 ? (value / total) * 100 : 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 4);
    return { list, total };
  }, [products, salesByProduct]);

  // Engajamento (vendas por dia da semana, últimos 7 dias)
  const engagementData = useMemo(() => {
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const out: { label: string; value: number; fullDate: string }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      const value = orders
        .filter((o) => {
          if (!CONFIRMED.includes(o.status)) return false;
          const od = new Date(o.created_at);
          return od >= d && od < next;
        })
        .reduce((s, o) => s + Number(o.total_value || 0), 0);
      out.push({
        label: days[d.getDay()],
        value,
        fullDate: d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' }),
      });
    }
    return out;
  }, [orders]);

  // Top produto (mais receita)
  const topProduct = useMemo(() => {
    let best: Product | null = null;
    let bestRev = -1;
    products.forEach((p) => {
      const rev = salesByProduct.get(p.name)?.revenue || 0;
      if (rev > bestRev) {
        bestRev = rev;
        best = p;
      }
    });
    return best;
  }, [products, salesByProduct]);

  const otherTopProducts = useMemo(() => {
    return products
      .filter((p) => p.id !== topProduct?.id)
      .map((p) => ({ p, rev: salesByProduct.get(p.name)?.revenue || 0 }))
      .sort((a, b) => b.rev - a.rev)
      .slice(0, 3)
      .map((x) => x.p);
  }, [products, salesByProduct, topProduct]);

  // Tabela de produtos
  const tableRows = useMemo(() => {
    const maxRevenue = Math.max(
      ...products.map((p) => salesByProduct.get(p.name)?.revenue || 0),
      1
    );
    const rows = products.map((p) => {
      const sales = salesByProduct.get(p.name);
      const rev = sales?.revenue || 0;
      const ratingData = ratingsByProduct.get(p.name);
      const rating = ratingData ? ratingData.sum / ratingData.count : 0;
      return {
        product: p,
        date: p.created_at || new Date().toISOString(),
        rating,
        rate: maxRevenue > 0 ? (rev / maxRevenue) * 100 : 0,
        revenue: rev,
        price: getMinPrice(p),
      };
    });
    const filtered = rows.filter((r) =>
      r.product.name.toLowerCase().includes(search.toLowerCase())
    );
    filtered.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortBy) {
        case 'name': return a.product.name.localeCompare(b.product.name) * dir;
        case 'date': return (new Date(a.date).getTime() - new Date(b.date).getTime()) * dir;
        case 'rating': return (a.rating - b.rating) * dir;
        case 'rate': return (a.rate - b.rate) * dir;
        case 'price': return (a.price - b.price) * dir;
      }
    });
    return filtered.slice(0, 20);
  }, [products, salesByProduct, ratingsByProduct, search, sortBy, sortDir]);

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">Produtos</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Visão geral do seu catálogo
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 w-full lg:w-auto">
          <div className="relative flex-1 lg:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar produto…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-full bg-muted/50 border-transparent focus:border-primary/40 h-10"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full bg-muted/60 hover:bg-muted h-10 w-10 shrink-0"
            aria-label="Notificações"
          >
            <Bell className="w-4 h-4" />
          </Button>
          <Button
            className="rounded-full h-10 px-4 sm:px-5 font-bold shrink-0 bg-gradient-to-r from-primary to-primary/80"
            onClick={() => navigate('/admin/produtos/novo')}
          >
            <Plus className="w-4 h-4 mr-1" /> Criar
          </Button>
        </div>
      </div>

      {/* Linha 1: KPIs lado a lado */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total de Produtos"
          value={products.length.toLocaleString('pt-BR')}
          icon={Package}
        />
        <KpiCard
          label="Total de Categorias"
          value={totalCategories.toLocaleString('pt-BR')}
          icon={Tag}
        />
        <KpiCard
          label="Receita Total"
          value={shortBRL(topCategories.total)}
          icon={TrendingUp}
        />
        <KpiCard
          label="Avaliações"
          value={reviews.length.toLocaleString('pt-BR')}
          icon={Star}
        />
      </div>

      {/* Linha 2: Top Categorias + Engajamento */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Categorias (donut) */}
        <Card className="border-border/40 shadow-sm flex flex-col">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-foreground">Top Categorias</h2>
              <button className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center" aria-label="Mais opções">
                <MoreVertical className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="flex items-center gap-4 flex-1">
              <SemiDonut total={topCategories.total} segments={topCategories.list} />
              <ul className="flex-1 space-y-2 min-w-0">
                {topCategories.list.length === 0 ? (
                  <li className="text-xs text-muted-foreground">Sem vendas ainda.</li>
                ) : (
                  topCategories.list.map((c, i) => (
                    <li key={c.name} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: donutColor(i) }}
                        />
                        <span className="truncate font-semibold text-foreground">{c.name}</span>
                      </span>
                      <span className="font-bold text-foreground shrink-0">{c.pct.toFixed(0)}%</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
            <Button
              variant="outline"
              className="w-full rounded-full mt-4 h-9 text-xs"
              onClick={() => navigate('/admin/relatorios')}
            >
              Ver detalhes <ArrowUpRight className="w-3 h-3 ml-1" />
            </Button>
          </CardContent>
        </Card>

        {/* Engajamento */}
        <Card className="border-border/40 shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-bold text-foreground">Engajamento</h2>
              <button className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center" aria-label="Mais opções">
                <MoreVertical className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">
              Vendas confirmadas dos últimos 7 dias
            </p>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={engagementData} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={shortBRL} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      fontSize: 11,
                      border: '1px solid hsl(var(--border))',
                    }}
                    formatter={(v: number) => formatBRL(v)}
                    labelFormatter={(l, payload) => payload?.[0]?.payload?.fullDate || l}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: 'hsl(var(--primary))' }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <Button
              variant="outline"
              className="w-full rounded-full mt-3 h-9 text-xs"
              onClick={() => navigate('/admin/relatorios')}
            >
              Ver detalhes <ArrowUpRight className="w-3 h-3 ml-1" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Tabela All Products + Top Product */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-border/40 shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-foreground">Todos os Produtos</h2>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full text-xs h-8"
                onClick={() => navigate('/admin/produtos')}
              >
                Gerenciar <ArrowUpRight className="w-3 h-3 ml-1" />
              </Button>
            </div>

            <div className="overflow-x-auto -mx-4 sm:-mx-5">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                    <th className="text-left font-semibold py-2 px-4 sm:px-5 w-8"></th>
                    <SortHeader label="Nome" col="name" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                    <SortHeader label="Data" col="date" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                    <SortHeader label="Avaliação" col="rating" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                    <SortHeader label="Performance" col="rate" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                    <SortHeader label="Preço" col="price" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {tableRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-xs text-muted-foreground py-8">
                        {loading ? 'Carregando…' : 'Nenhum produto encontrado.'}
                      </td>
                    </tr>
                  ) : (
                    tableRows.map((row) => (
                      <tr
                        key={row.product.id}
                        className="border-b border-border/30 last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => navigate(`/admin/produtos/${row.product.id}`)}
                      >
                        <td className="py-3 px-4 sm:px-5" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selected.has(row.product.id)}
                            onCheckedChange={() => toggleSelect(row.product.id)}
                          />
                        </td>
                        <td className="py-3 pr-4 font-semibold text-foreground truncate max-w-[180px]">
                          {row.product.name}
                        </td>
                        <td className="py-3 pr-4 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(row.date)}
                        </td>
                        <td className="py-3 pr-4">
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-foreground">
                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                            {row.rating > 0 ? row.rating.toFixed(1) : '—'}
                          </span>
                        </td>
                        <td className="py-3 pr-4 min-w-[140px]">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60"
                                style={{ width: `${Math.max(row.rate, 4)}%` }}
                              />
                            </div>
                            <span className="text-[11px] font-semibold text-muted-foreground shrink-0 w-9 text-right">
                              {row.rate.toFixed(0)}%
                            </span>
                          </div>
                        </td>
                        <td className="py-3 pr-4 sm:pr-5 text-right font-bold text-foreground whitespace-nowrap">
                          {formatBRL(row.price)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Top Product */}
        <Card className="border-border/40 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="p-4 sm:p-5 pb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <Award className="w-4 h-4 text-primary" /> Top Produto
              </h2>
              <button className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center" aria-label="Mais opções">
                <MoreVertical className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {topProduct ? (
              <>
                <div
                  className="mx-4 rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-primary/20 p-4 cursor-pointer sm:mx-[20px] my-0 py-[18px] px-[16px]"
                  onClick={() => navigate(`/admin/produtos/${topProduct.id}`)}
                >
                  <p className="text-sm font-bold text-foreground mb-2 truncate">{topProduct.name}</p>
                  <div className="aspect-[4/3] rounded-xl overflow-hidden bg-card flex items-center justify-center">
                    {getImage(topProduct) ? (
                      <img
                        src={getImage(topProduct)!}
                        alt={topProduct.name}
                        loading="lazy"
                        className="w-full h-full object-cover py-[9px] mt-0 px-[75px]"
                      />
                    ) : (
                      <Package className="w-10 h-10 text-primary/40" />
                    )}
                  </div>
                  <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card/80 backdrop-blur text-xs font-bold text-foreground shadow-sm">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    {(ratingsByProduct.get(topProduct.name)?.sum ?? 0) > 0
                      ? (
                          (ratingsByProduct.get(topProduct.name)!.sum /
                            ratingsByProduct.get(topProduct.name)!.count
                          ).toFixed(1)
                        )
                      : '5.0'}
                    <span className="text-muted-foreground">|</span>
                    {formatBRL(getMinPrice(topProduct))}
                  </div>
                </div>

                <ul className="px-4 sm:px-5 pt-4 pb-4 space-y-3">
                  {otherTopProducts.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/produtos/${p.id}`)}
                        className="w-full flex items-center gap-3 hover:bg-muted/40 -mx-2 px-2 py-1.5 rounded-lg text-left"
                      >
                        <div className="shrink-0 w-10 h-10 rounded-xl bg-muted/50 overflow-hidden flex items-center justify-center">
                          {getImage(p) ? (
                            <img src={getImage(p)!} alt={p.name} loading="lazy" className="w-full h-full object-cover" />
                          ) : (
                            <Package className="w-4 h-4 text-muted-foreground/40" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                          <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            {(ratingsByProduct.get(p.name)?.sum ?? 0) > 0
                              ? (
                                  ratingsByProduct.get(p.name)!.sum /
                                  ratingsByProduct.get(p.name)!.count
                                ).toFixed(1)
                              : '—'}
                          </p>
                        </div>
                        <p className="text-sm font-bold text-foreground shrink-0">
                          {formatBRL(getMinPrice(p))}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="p-6 text-center text-xs text-muted-foreground">
                <TrendingUp className="w-6 h-6 mx-auto mb-2 text-muted-foreground/40" />
                Sem dados de vendas ainda.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <Card className="border-border/40 shadow-sm">
      <CardContent className="p-5 flex flex-col items-center justify-center text-center min-h-[140px]">
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center mb-2">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className="text-3xl sm:text-4xl font-black text-foreground tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

function SortHeader({
  label, col, sortBy, sortDir, onClick, align = 'left',
}: {
  label: string;
  col: 'name' | 'date' | 'rating' | 'rate' | 'price';
  sortBy: string;
  sortDir: 'asc' | 'desc';
  onClick: (col: any) => void;
  align?: 'left' | 'right';
}) {
  const active = sortBy === col;
  return (
    <th className={`font-semibold py-2 pr-4 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => onClick(col)}
        className={`inline-flex items-center gap-1 hover:text-foreground ${active ? 'text-foreground' : ''}`}
      >
        {label}
        <ChevronsUpDown className={`w-3 h-3 ${active ? (sortDir === 'asc' ? 'rotate-180' : '') : 'opacity-50'}`} />
      </button>
    </th>
  );
}

function donutColor(i: number): string {
  const palette = [
    'hsl(var(--primary))',
    'hsl(220 9% 22%)',
    'hsl(43 96% 56%)',
    'hsl(35 91% 65%)',
  ];
  return palette[i % palette.length];
}

function SemiDonut({ total, segments }: { total: number; segments: { name: string; value: number; pct: number }[] }) {
  const size = 130;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const halfC = Math.PI * r; // semicircle length

  let cumulative = 0;
  const arcs = segments.map((seg, i) => {
    const len = (seg.pct / 100) * halfC;
    const dasharray = `${len} ${halfC * 2}`;
    const dashoffset = -cumulative;
    cumulative += len;
    return { color: donutColor(i), dasharray, dashoffset };
  });

  return (
    <div className="relative shrink-0" style={{ width: size, height: size / 2 + 12 }}>
      <svg width={size} height={size} className="overflow-visible">
        {/* track */}
        <path
          d={`M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${cy}`}
          stroke="hsl(var(--muted))"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
        />
        {arcs.map((a, i) => (
          <path
            key={i}
            d={`M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${cy}`}
            stroke={a.color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={a.dasharray}
            strokeDashoffset={a.dashoffset}
          />
        ))}
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <p className="text-[10px] text-muted-foreground leading-none">Receita</p>
        <p className="text-base font-black text-foreground leading-tight">{shortBRL(total)}</p>
      </div>
    </div>
  );
}