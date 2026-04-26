import { useState, useEffect } from 'react';
import { fetchSetting, upsertSetting, getCurrentUser } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Tags, Plus, Trash2, GripVertical, Pencil, Check, X } from 'lucide-react';
import SettingsBackButton from './SettingsBackButton';

const SettingsCategories = () => {
  const { toast } = useToast();
  const [categories, setCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSetting('product_categories').then((val) => {
      if (val) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) setCategories(parsed);
        } catch {}
      }
      setLoading(false);
    });
  }, []);

  const saveCategories = async (updated: string[]) => {
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Não autenticado');
      await upsertSetting('product_categories', JSON.stringify(updated), user.id);
      setCategories(updated);
      toast({ title: 'Categorias salvas!' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = () => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    if (categories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      toast({ title: 'Categoria já existe', variant: 'destructive' });
      return;
    }
    const updated = [...categories, trimmed];
    saveCategories(updated);
    setNewCategory('');
  };

  const handleRemove = (index: number) => {
    const updated = categories.filter((_, i) => i !== index);
    saveCategories(updated);
  };

  const handleStartEdit = (index: number) => {
    setEditingIndex(index);
    setEditValue(categories[index]);
  };

  const handleConfirmEdit = () => {
    if (editingIndex === null) return;
    const trimmed = editValue.trim();
    if (!trimmed) return;
    if (categories.some((c, i) => i !== editingIndex && c.toLowerCase() === trimmed.toLowerCase())) {
      toast({ title: 'Categoria já existe', variant: 'destructive' });
      return;
    }
    const updated = [...categories];
    updated[editingIndex] = trimmed;
    saveCategories(updated);
    setEditingIndex(null);
    setEditValue('');
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditValue('');
  };

  if (loading) return <SettingsSkeleton />;

  return (
    <div className="space-y-6 w-full">
      <SettingsBackButton title="Categorias de Produtos" description="Gerencie as categorias disponíveis para seus produtos." />

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Tags className="w-5 h-5" /> Categorias
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Nome da nova categoria"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <Button onClick={handleAdd} disabled={saving || !newCategory.trim()} size="sm" className="shrink-0">
              <Plus className="w-4 h-4 mr-1" /> Adicionar
            </Button>
          </div>

          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhuma categoria cadastrada ainda.
            </p>
          ) : (
            <div className="border border-border/50 rounded-lg divide-y divide-border/50">
              {categories.map((cat, index) => (
                <div key={index} className="flex items-center gap-3 px-4 py-3">
                  <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                  {editingIndex === index ? (
                    <>
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="flex-1"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleConfirmEdit();
                          if (e.key === 'Escape') handleCancelEdit();
                        }}
                        autoFocus
                      />
                      <Button size="icon" variant="ghost" onClick={handleConfirmEdit} className="shrink-0 h-8 w-8">
                        <Check className="w-4 h-4 text-primary" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={handleCancelEdit} className="shrink-0 h-8 w-8">
                        <X className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-foreground">{cat}</span>
                      <Button size="icon" variant="ghost" onClick={() => handleStartEdit(index)} className="shrink-0 h-8 w-8">
                        <Pencil className="w-4 h-4 text-muted-foreground" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleRemove(index)} className="shrink-0 h-8 w-8">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsCategories;
