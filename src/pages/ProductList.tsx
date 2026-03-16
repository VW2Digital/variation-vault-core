import { useEffect, useState } from 'react';
import { fetchProducts, deleteProduct as apiDeleteProduct } from '@/lib/api';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Package, MoreVertical } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const ProductList = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

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

  const handleDelete = async (id: string) => {
    try {
      await apiDeleteProduct(id);
      toast({ title: 'Produto excluído!' });
      load();
    } catch (err: any) {
      toast({ title: 'Erro ao excluir', description: err.message, variant: 'destructive' });
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
        <div className="border border-border/50 rounded-lg overflow-hidden divide-y divide-border/40">
          {products.map((product) => {
            const img = product.product_variations?.[0]?.images?.[0] || product.product_variations?.[0]?.image_url || product.images?.[0];
            return (
              <div
                key={product.id}
                className="flex items-center gap-3 px-3 py-2.5 bg-card hover:bg-muted/30 transition-colors cursor-pointer"
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="shrink-0 h-7 w-7" onClick={(e) => e.stopPropagation()}>
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/admin/produtos/${product.id}`); }}>
                      <Pencil className="mr-2 h-3.5 w-3.5" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: product.id, name: product.name }); }}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation dialog */}
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
