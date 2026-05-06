import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Save, Trash2, Loader2, Sparkles } from 'lucide-react';

interface Variation {
  id: string;
  dosage: string;
  in_stock: boolean;
}

interface Product {
  id: string;
  name: string;
  active: boolean;
  variations: Variation[];
}

interface UpsellRow {
  id: string; // local key
  upsell_product_id: string;
  upsell_variation_id: string | null;
  sort_order: number;
}

const SortableRow = ({
  row,
  products,
  onChangeProduct,
  onChangeVariation,
  onRemove,
}: {
  row: UpsellRow;
  products: Product[];
  onChangeProduct: (productId: string) => void;
  onChangeVariation: (variationId: string | null) => void;
  onRemove: () => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const product = products.find(p => p.id === row.upsell_product_id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 bg-card border border-border/50 rounded-lg p-2"
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1"
        {...attributes}
        {...listeners}
        aria-label="Reordenar"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Select value={row.upsell_product_id} onValueChange={onChangeProduct}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Selecione o produto" />
          </SelectTrigger>
          <SelectContent>
            {products.map(p => (
              <SelectItem key={p.id} value={p.id} className="text-sm">
                {p.name} {!p.active && <span className="text-muted-foreground">(inativo)</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={row.upsell_variation_id ?? '__any__'}
          onValueChange={(v) => onChangeVariation(v === '__any__' ? null : v)}
          disabled={!product}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Variação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__any__" className="text-sm">Qualquer variação</SelectItem>
            {product?.variations.map(v => (
              <SelectItem key={v.id} value={v.id} className="text-sm">
                {v.dosage} {!v.in_stock && '(sem estoque)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onRemove}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
};

const UpsellManagerPage = () => {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [rows, setRows] = useState<UpsellRow[]>([]);
  const [dirty, setDirty] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('products')
          .select('id, name, active, product_variations(id, dosage, in_stock)')
          .order('name', { ascending: true });
        if (error) throw error;
        const mapped: Product[] = ((data as any[]) || []).map(p => ({
          id: p.id,
          name: p.name,
          active: p.active,
          variations: (p.product_variations || []).map((v: any) => ({
            id: v.id,
            dosage: v.dosage,
            in_stock: v.in_stock,
          })),
        }));
        setProducts(mapped);
      } catch (err: any) {
        toast({ title: 'Erro ao carregar produtos', description: err.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  useEffect(() => {
    if (!selectedProductId) {
      setRows([]);
      setDirty(false);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from('product_upsells' as any)
        .select('upsell_product_id, upsell_variation_id, sort_order')
        .eq('product_id', selectedProductId)
        .order('sort_order', { ascending: true });
      if (error) {
        toast({ title: 'Erro ao carregar upsells', description: error.message, variant: 'destructive' });
        return;
      }
      setRows(
        ((data as any[]) || []).map((r, i) => ({
          id: `${r.upsell_product_id}-${i}`,
          upsell_product_id: r.upsell_product_id,
          upsell_variation_id: r.upsell_variation_id ?? null,
          sort_order: r.sort_order ?? i,
        }))
      );
      setDirty(false);
    })();
  }, [selectedProductId, toast]);

  const filteredProducts = useMemo(
    () =>
      products.filter(p =>
        !search || p.name.toLowerCase().includes(search.toLowerCase())
      ),
    [products, search]
  );

  const availableUpsellProducts = useMemo(
    () => products.filter(p => p.id !== selectedProductId),
    [products, selectedProductId]
  );

  const handleAddRow = () => {
    const used = new Set(rows.map(r => r.upsell_product_id));
    const next = availableUpsellProducts.find(p => !used.has(p.id));
    if (!next) {
      toast({ title: 'Sem mais produtos disponíveis para adicionar' });
      return;
    }
    setRows(prev => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        upsell_product_id: next.id,
        upsell_variation_id: null,
        sort_order: prev.length,
      },
    ]);
    setDirty(true);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setRows(prev => {
      const oldIndex = prev.findIndex(r => r.id === active.id);
      const newIndex = prev.findIndex(r => r.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
    setDirty(true);
  };

  const handleSave = async () => {
    if (!selectedProductId) return;
    setSaving(true);
    try {
      const { error: delError } = await supabase
        .from('product_upsells' as any)
        .delete()
        .eq('product_id', selectedProductId);
      if (delError) throw delError;
      const payload = rows.map((r, idx) => ({
        product_id: selectedProductId,
        upsell_product_id: r.upsell_product_id,
        upsell_variation_id: r.upsell_variation_id,
        sort_order: idx,
      }));
      if (payload.length > 0) {
        const { error: insError } = await supabase
          .from('product_upsells' as any)
          .insert(payload as any);
        if (insError) throw insError;
      }
      toast({ title: 'Upsells salvos com sucesso' });
      setDirty(false);
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const selectedProduct = products.find(p => p.id === selectedProductId);

  return (
    <div className="container max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Sparkles className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Gerenciar Upsells</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Defina quais produtos aparecem como recomendação e o checkout. Arraste para reordenar e
        opcionalmente fixe uma variação específica.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: product list */}
        <Card className="p-3 lg:col-span-1">
          <Input
            placeholder="Buscar produto base..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-3"
          />
          <div className="max-h-[60vh] overflow-y-auto space-y-1">
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
              </div>
            )}
            {!loading &&
              filteredProducts.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProductId(p.id)}
                  className={`w-full text-left text-sm p-2 rounded-md border transition-colors ${
                    selectedProductId === p.id
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-transparent hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{p.name}</span>
                    {!p.active && (
                      <Badge variant="secondary" className="text-[10px]">inativo</Badge>
                    )}
                  </div>
                </button>
              ))}
          </div>
        </Card>

        {/* Right: editor */}
        <Card className="p-4 lg:col-span-2 space-y-4">
          {!selectedProductId && (
            <div className="text-sm text-muted-foreground py-12 text-center">
              Selecione um produto à esquerda para gerenciar seus upsells.
            </div>
          )}

          {selectedProductId && (
            <>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-xs text-muted-foreground">Produto base</p>
                  <p className="font-bold text-foreground">{selectedProduct?.name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleAddRow}>
                    <Plus className="w-4 h-4 mr-1" /> Adicionar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSave}
                    disabled={!dirty || saving}
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-1" />
                    )}
                    Salvar
                  </Button>
                </div>
              </div>

              {rows.length === 0 ? (
                <div className="text-sm text-muted-foreground border border-dashed border-border rounded-lg p-8 text-center">
                  Nenhum upsell configurado. Clique em "Adicionar" para começar.
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={rows.map(r => r.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {rows.map(row => (
                        <SortableRow
                          key={row.id}
                          row={row}
                          products={availableUpsellProducts}
                          onChangeProduct={(pid) => {
                            setRows(prev =>
                              prev.map(r =>
                                r.id === row.id
                                  ? { ...r, upsell_product_id: pid, upsell_variation_id: null }
                                  : r
                              )
                            );
                            setDirty(true);
                          }}
                          onChangeVariation={(vid) => {
                            setRows(prev =>
                              prev.map(r =>
                                r.id === row.id ? { ...r, upsell_variation_id: vid } : r
                              )
                            );
                            setDirty(true);
                          }}
                          onRemove={() => {
                            setRows(prev => prev.filter(r => r.id !== row.id));
                            setDirty(true);
                          }}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
};

export default UpsellManagerPage;