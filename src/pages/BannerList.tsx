import { useState, useEffect } from 'react';
import { fetchAllBanners, createBanner, updateBanner, deleteBanner } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Megaphone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const BannerList = () => {
  const [banners, setBanners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    fetchAllBanners().then(setBanners).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newText.trim()) return;
    setSaving(true);
    try {
      await createBanner(newText.trim());
      setNewText('');
      toast({ title: 'Banner criado!' });
      load();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id: string, active: boolean) => {
    try {
      await updateBanner(id, { active });
      setBanners((prev) => prev.map((b) => (b.id === id ? { ...b, active } : b)));
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteBanner(id);
      setBanners((prev) => prev.filter((b) => b.id !== id));
      toast({ title: 'Banner removido' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center gap-3">
        <Megaphone className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Banners</h1>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Novo Banner</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="Ex: 🔥 PROMOÇÃO ESPECIAL — FALE CONOSCO!"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <Button onClick={handleCreate} disabled={saving || !newText.trim()}>
              <Plus className="mr-1 h-4 w-4" /> Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Banners Ativos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-muted-foreground text-sm">Carregando...</p>
          ) : banners.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum banner cadastrado.</p>
          ) : (
            banners.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-muted/30"
              >
                <Switch
                  checked={b.active}
                  onCheckedChange={(val) => handleToggle(b.id, val)}
                />
                <span className={`flex-1 text-sm ${b.active ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                  {b.text}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(b.id)}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BannerList;
