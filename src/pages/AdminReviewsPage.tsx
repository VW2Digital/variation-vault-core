import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
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

const AdminReviewsPage = () => {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReviews = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Erro ao carregar avaliações');
    } else {
      setReviews(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchReviews(); }, []);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('reviews').delete().eq('id', id);
    if (error) {
      toast.error('Erro ao excluir avaliação');
    } else {
      toast.success('Avaliação excluída');
      setReviews((prev) => prev.filter((r) => r.id !== id));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Gerenciar Avaliações</h1>
        <p className="text-muted-foreground text-sm">Modere e gerencie as avaliações dos clientes.</p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : reviews.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma avaliação encontrada.</p>
      ) : (
        <div className="rounded-xl border border-border/50 overflow-hidden overflow-x-auto">
          <Table className="min-w-[600px]">
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Nota</TableHead>
                <TableHead>Comentário</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="w-[80px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reviews.map((rev) => (
                <TableRow key={rev.id}>
                  <TableCell className="font-medium text-sm">{rev.product_name}</TableCell>
                  <TableCell>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} className={`w-3.5 h-3.5 ${s <= rev.rating ? 'fill-primary text-primary' : 'text-muted-foreground/30'}`} />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
                    {rev.comment || <span className="italic">Sem comentário</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(rev.created_at).toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir avaliação?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação não pode ser desfeita. A avaliação será removida permanentemente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(rev.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default AdminReviewsPage;
