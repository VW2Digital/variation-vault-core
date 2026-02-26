import { useProducts } from '@/store';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Package } from 'lucide-react';
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

const ProductList = () => {
  const { products, deleteProduct } = useProducts();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Produtos</h1>
        <Button onClick={() => navigate('/admin/produtos/novo')}>
          <Plus className="mr-2 h-4 w-4" /> Novo Produto
        </Button>
      </div>

      {products.length === 0 ? (
        <Card className="border-dashed border-2 border-border">
          <CardContent className="p-12 text-center">
            <Package className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Nenhum produto cadastrado</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate('/admin/produtos/novo')}>
              Cadastrar primeiro produto
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {products.map((product) => (
            <Card key={product.id} className="border-border/50 hover:shadow-md transition-shadow">
              <CardContent className="p-5 flex items-center gap-5">
                <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  {product.images[0] ? (
                    <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover rounded-lg" />
                  ) : (
                    <Package className="w-8 h-8 text-muted-foreground/40" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{product.name}</h3>
                  <p className="text-sm text-muted-foreground truncate">{product.subtitle}</p>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {product.variations.map((v) => (
                      <Badge key={v.id} variant={v.inStock ? 'default' : 'destructive'} className="text-xs">
                        {v.dosage} — R$ {v.price.toLocaleString('pt-BR')}
                        {v.isOffer && ' 🏷️'}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => navigate(`/admin/produtos/${product.id}`)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="icon" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação não pode ser desfeita. O produto "{product.name}" será removido permanentemente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteProduct(product.id)}>
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductList;
