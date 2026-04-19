import { useEffect, useState } from 'react';
import { fetchProducts, deleteProduct as apiDeleteProduct, setProductActive } from '@/lib/api';
import { Switch } from '@/components/ui/switch';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Package, MoreVertical, Copy, Loader2, GripVertical } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';


interface SortableProductRowProps {
  product: any;
  navigate: (path: string) => void;
  onDelete: (product: { id: string; name: string }) => void;
  onDuplicate: (product: any) => void;
  onToggleActive: (product: any, active: boolean) => void;
  duplicating: string | null;
}

const SortableProductRow = ({ product, navigate, onDelete, onDuplicate, onToggleActive, duplicating }: SortableProductRowProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: product.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.8 : 1,
  };

  const img = product.product_variations?.[0]?.images?.[0] || product.product_variations?.[0]?.image_url || product.images?.[0];

  const isActive = product.active !== false;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-2 py-2.5 bg-card hover:bg-muted/30 transition-colors ${isDragging ? 'shadow-lg rounded-lg border border-primary/30' : ''} ${!isActive ? 'opacity-60' : ''}`}
    >
      <button
        className="shrink-0 cursor-grab active:cursor-grabbing touch-none p-1 text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <div
        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
        onClick={() => navigate(`/admin/produtos/${product.id}`)}
      >
        <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center shrink-0 overflow-hidden">
          {img ? (
            <img src={img} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <Package className="w-5 h-5 text-muted-foreground/40" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground text-sm truncate">{product.name}</h3>
          <div className="flex gap-1 mt-0.5 flex-wrap">
            {product.product_variations?.map((v: any) => (
              <Badge key={v.id} variant={v.in_stock ? 'default' : 'destructive'} className="text-[9px] px-1.5 py-0 h-[18px]">
                {v.dosage && !product.name.toLowerCase().includes(v.dosage.toLowerCase()) ? `${v.dosage} — ` : ''}R$ {Number(v.price).toLocaleString('pt-BR')}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0" title={isActive ? 'Ativo' : 'Inativo'}>
        <Switch
          checked={isActive}
          onCheckedChange={(checked) => onToggleActive(product, checked)}
          aria-label={isActive ? 'Desativar produto' : 'Ativar produto'}
        />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="shrink-0 h-7 w-7">
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => navigate(`/admin/produtos/${product.id}`)}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDuplicate(product)} disabled={duplicating === product.id}>
            {duplicating === product.id ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Copy className="mr-2 h-3.5 w-3.5" />}
            Copiar
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => onDelete({ id: product.id, name: product.name })}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

const ProductList = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchProducts();
      setProducts(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = products.findIndex(p => p.id === active.id);
    const newIndex = products.findIndex(p => p.id === over.id);
    const reordered = arrayMove(products, oldIndex, newIndex);
    setProducts(reordered);

    // Persist new order
    try {
      const updates = reordered.map((p, idx) => 
        supabase.from('products').update({ sort_order: idx } as any).eq('id', p.id)
      );
      await Promise.all(updates);
    } catch (err) {
      console.error('Erro ao salvar ordem:', err);
      toast({ title: 'Erro ao salvar ordem', variant: 'destructive' });
      load(); // reload original order
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiDeleteProduct(id);
      toast({ title: 'Produto excluído!' });
      load();
    } catch (err: any) {
      toast({ title: 'Erro ao excluir', description: err.message, variant: 'destructive' });
    }
  };

  const handleToggleActive = async (product: any, active: boolean) => {
    // Optimistic update
    setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, active } : p)));
    try {
      await setProductActive(product.id, active);
      toast({ title: active ? 'Produto ativado' : 'Produto desativado' });
    } catch (err: any) {
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, active: !active } : p)));
      toast({ title: 'Erro ao atualizar status', description: err.message, variant: 'destructive' });
    }
  };

  const handleDuplicate = async (product: any) => {
    setDuplicating(product.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      const { id, created_at, updated_at, product_variations, sort_order, ...productData } = product;
      const { data: newProduct, error } = await supabase
        .from('products')
        .insert({ ...productData, name: `${product.name} (Cópia)`, user_id: session.user.id, sort_order: products.length } as any)
        .select('id')
        .single();
      if (error || !newProduct) throw error || new Error('Erro ao duplicar');

      if (product_variations?.length) {
        for (const v of product_variations) {
          const { id: vId, created_at: vCa, product_id, ...varData } = v;
          const { data: newVar, error: varErr } = await supabase
            .from('product_variations')
            .insert({ ...varData, product_id: newProduct.id })
            .select('id')
            .single();
          if (varErr) console.error('Erro ao duplicar variação:', varErr);

          if (newVar) {
            const { data: wholesalePrices } = await supabase
              .from('wholesale_prices')
              .select('*')
              .eq('variation_id', vId);
            if (wholesalePrices?.length) {
              for (const wp of wholesalePrices) {
                const { id: wpId, created_at: wpCa, variation_id, ...wpData } = wp;
                await supabase.from('wholesale_prices').insert({ ...wpData, variation_id: newVar.id });
              }
            }
          }
        }
      }

      toast({ title: `Produto "${product.name}" duplicado!` });
      load();
    } catch (err: any) {
      toast({ title: 'Erro ao duplicar', description: err.message, variant: 'destructive' });
    } finally {
      setDuplicating(null);
    }
  };

  if (loading) return <p className="text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-foreground">Produtos</h1>
        <Button size="sm" onClick={() => navigate('/admin/produtos/novo')}>
          <Plus className="mr-1.5 h-4 w-4" /> Novo Produto
        </Button>
      </div>

      {products.length === 0 ? (
        <Card className="border-dashed border-2 border-border">
          <CardContent className="p-8 text-center">
            <Package className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground text-sm">Nenhum produto cadastrado</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate('/admin/produtos/novo')}>
              Cadastrar primeiro produto
            </Button>
          </CardContent>
        </Card>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={products.map(p => p.id)} strategy={verticalListSortingStrategy}>
            <div className="border border-border/50 rounded-lg overflow-hidden divide-y divide-border/40">
              {products.map((product) => (
                <SortableProductRow
                  key={product.id}
                  product={product}
                  navigate={navigate}
                  onDelete={setDeleteTarget}
                  onDuplicate={handleDuplicate}
                  onToggleActive={handleToggleActive}
                  duplicating={duplicating}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              O produto "{deleteTarget?.name}" será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteTarget) handleDelete(deleteTarget.id); setDeleteTarget(null); }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProductList;
