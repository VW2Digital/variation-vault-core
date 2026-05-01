import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Layers, Download, Save, Trash2, Search, Loader2, Package } from 'lucide-react';

interface TierRow {
  id: string;
  variation_id: string;
  min_quantity: number;
  price: number;
  // Campos derivados
  product_id: string;
  product_name: string;
  dosage: string;
  retail_price: number;
  // Estado local de edição
  edited_min: number;
  edited_price: number;
  dirty: boolean;
  saving?: boolean;
}

const formatBRL = (n: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function WholesalePricingPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<TierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [savingAll, setSavingAll] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data: tiers, error } = await supabase
        .from('wholesale_prices')
        .select('id, variation_id, min_quantity, price')
        .order('min_quantity', { ascending: true });
      if (error) throw error;

      const varIds = [...new Set((tiers || []).map((t) => t.variation_id))];
      let varMap: Record<string, { product_id: string; dosage: string; price: number }> = {};
      let prodMap: Record<string, string> = {};

      if (varIds.length > 0) {
        const { data: variations } = await supabase
          .from('product_variations')
          .select('id, product_id, dosage, price')
          .in('id', varIds);
        (variations || []).forEach((v: any) => {
          varMap[v.id] = { product_id: v.product_id, dosage: v.dosage || '', price: Number(v.price) };
        });
        const prodIds = [...new Set(Object.values(varMap).map((v) => v.product_id))];
        if (prodIds.length > 0) {
          const { data: products } = await supabase
            .from('products')
            .select('id, name')
            .in('id', prodIds);
          (products || []).forEach((p: any) => (prodMap[p.id] = p.name));
        }
      }

      const enriched: TierRow[] = (tiers || []).map((t: any) => {
        const v = varMap[t.variation_id];
        return {
          id: t.id,
          variation_id: t.variation_id,
          min_quantity: t.min_quantity,
          price: Number(t.price),
          product_id: v?.product_id || '',
          product_name: prodMap[v?.product_id || ''] || '—',
          dosage: v?.dosage || '',
          retail_price: v?.price || 0,
          edited_min: t.min_quantity,
          edited_price: Number(t.price),
          dirty: false,
        };
      });

      // Ordena por nome do produto, depois min_quantity
      enriched.sort((a, b) => {
        const n = a.product_name.localeCompare(b.product_name);
        if (n !== 0) return n;
        const d = a.dosage.localeCompare(b.dosage);
        if (d !== 0) return d;
        return a.min_quantity - b.min_quantity;
      });

      setRows(enriched);
    } catch (err: any) {
      toast({ title: 'Erro ao carregar tiers', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.product_name.toLowerCase().includes(q) ||
        r.dosage.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const dirtyCount = rows.filter((r) => r.dirty).length;

  const updateLocal = (id: string, patch: Partial<Pick<TierRow, 'edited_min' | 'edited_price'>>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        next.dirty = next.edited_min !== r.min_quantity || next.edited_price !== r.price;
        return next;
      }),
    );
  };

  const saveRow = async (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (!row || !row.dirty) return;
    if (row.edited_min < 1 || row.edited_price <= 0) {
      toast({ title: 'Valores inválidos', description: 'Mínimo deve ser ≥ 1 e preço > 0.', variant: 'destructive' });
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, saving: true } : r)));
    const { error } = await supabase
      .from('wholesale_prices')
      .update({ min_quantity: row.edited_min, price: row.edited_price })
      .eq('id', id);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, saving: false } : r)));
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, min_quantity: r.edited_min, price: r.edited_price, dirty: false, saving: false }
          : r,
      ),
    );
    toast({ title: 'Tier salvo' });
  };

  const saveAllDirty = async () => {
    setSavingAll(true);
    try {
      const dirty = rows.filter((r) => r.dirty);
      for (const r of dirty) {
        if (r.edited_min < 1 || r.edited_price <= 0) continue;
        await supabase
          .from('wholesale_prices')
          .update({ min_quantity: r.edited_min, price: r.edited_price })
          .eq('id', r.id);
      }
      toast({ title: `${dirty.length} tier(s) salvo(s)` });
      await load();
    } catch (err: any) {
      toast({ title: 'Erro em lote', description: err.message, variant: 'destructive' });
    } finally {
      setSavingAll(false);
    }
  };

  const deleteRow = async (id: string) => {
    const ok = window.confirm('Excluir este tier de atacado? Esta ação é permanente.');
    if (!ok) return;
    const { error } = await supabase.from('wholesale_prices').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
    toast({ title: 'Tier excluído' });
  };

  const exportCsv = () => {
    const header = [
      'product_name',
      'dosage',
      'variation_id',
      'tier_id',
      'min_quantity',
      'wholesale_price',
      'retail_price',
      'discount_percent',
    ];
    const escape = (val: string | number) => {
      const s = String(val ?? '');
      if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [header.join(',')];
    filtered.forEach((r) => {
      const disc = r.retail_price > 0 ? ((r.retail_price - r.price) / r.retail_price) * 100 : 0;
      lines.push(
        [
          escape(r.product_name),
          escape(r.dosage),
          escape(r.variation_id),
          escape(r.id),
          r.min_quantity,
          r.price.toFixed(2),
          r.retail_price.toFixed(2),
          disc.toFixed(1),
        ].join(','),
      );
    });
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `tiers-atacado-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Tiers de Atacado"
        description="Revise e ajuste os preços de atacado por variação. Exporte para CSV ou edite em massa."
        icon={Layers}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="w-4 h-4 mr-1.5" /> Exportar CSV
            </Button>
            <Button size="sm" onClick={saveAllDirty} disabled={dirtyCount === 0 || savingAll}>
              {savingAll ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
              Salvar pendentes ({dirtyCount})
            </Button>
          </div>
        }
      />

      <Card className="border-border/50">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por produto ou dosagem..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2 text-xs text-muted-foreground items-center">
              <Badge variant="outline" className="gap-1">
                <Package className="w-3 h-3" />
                {filtered.length} {filtered.length === 1 ? 'tier' : 'tiers'}
              </Badge>
              {dirtyCount > 0 && (
                <Badge className="bg-warning/15 text-warning border-warning/30">
                  {dirtyCount} pendente(s)
                </Badge>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando tiers...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Layers className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Nenhum tier de atacado encontrado</p>
              <p className="text-xs mt-1">Configure tiers diretamente nas variações dos produtos.</p>
            </div>
          ) : (
            <div className="border border-border/50 rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Produto</TableHead>
                    <TableHead>Variação</TableHead>
                    <TableHead className="text-right">Varejo</TableHead>
                    <TableHead className="w-[120px]">Mín. quantidade</TableHead>
                    <TableHead className="w-[140px]">Preço atacado (R$)</TableHead>
                    <TableHead className="text-right">Desconto</TableHead>
                    <TableHead className="w-[160px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const disc =
                      r.retail_price > 0
                        ? Math.round(((r.retail_price - r.edited_price) / r.retail_price) * 100)
                        : 0;
                    return (
                      <TableRow key={r.id} className={r.dirty ? 'bg-warning/5' : ''}>
                        <TableCell className="font-medium text-foreground">{r.product_name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{r.dosage || '—'}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          R$ {formatBRL(r.retail_price)}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={1}
                            value={r.edited_min}
                            onChange={(e) =>
                              updateLocal(r.id, { edited_min: parseInt(e.target.value) || 0 })
                            }
                            className="h-9"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={r.edited_price}
                            onChange={(e) =>
                              updateLocal(r.id, { edited_price: parseFloat(e.target.value) || 0 })
                            }
                            className="h-9"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          {disc > 0 ? (
                            <Badge className="bg-success/15 text-success border-success/30">-{disc}%</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant={r.dirty ? 'default' : 'outline'}
                              onClick={() => saveRow(r.id)}
                              disabled={!r.dirty || r.saving}
                              className="h-8"
                            >
                              {r.saving ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Save className="w-3.5 h-3.5" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => deleteRow(r.id)}
                              className="h-8 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}