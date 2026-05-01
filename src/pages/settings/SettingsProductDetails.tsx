import { useState, useEffect } from 'react';
import { fetchSettingsBulk, upsertSetting, getCurrentUser } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ListChecks } from 'lucide-react';
import SettingsBackButton from './SettingsBackButton';
import SettingsSkeleton from '@/components/admin/settings/SettingsSkeleton';

const FIELDS: { key: string; label: string; placeholder: string }[] = [
  { key: 'product_label_active_ingredient', label: 'Princípio Ativo', placeholder: 'Princípio Ativo' },
  { key: 'product_label_dosage', label: 'Dosagem', placeholder: 'Dosagem' },
  { key: 'product_label_pharma_form', label: 'Forma Farmacêutica', placeholder: 'Forma Farmacêutica' },
  { key: 'product_label_admin_route', label: 'Via de Administração', placeholder: 'Via de Administração' },
  { key: 'product_label_frequency', label: 'Frequência de Uso', placeholder: 'Frequência de Uso' },
];

const SettingsProductDetails = () => {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettingsBulk(FIELDS.map((f) => f.key))
      .then((map) => setValues(map))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Não autenticado');
      for (const f of FIELDS) {
        await upsertSetting(f.key, (values[f.key] || '').trim(), user.id);
      }
      toast({ title: 'Rótulos salvos!' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SettingsSkeleton />;

  return (
    <div className="space-y-6 w-full">
      <SettingsBackButton
        title="Detalhes do Produto"
        description="Personalize os rótulos exibidos na seção 'Detalhes do Produto' da página do produto. Deixe vazio para usar o texto padrão."
      />

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ListChecks className="w-5 h-5" /> Rótulos dos Detalhes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-2">
              <Label htmlFor={f.key}>{f.label}</Label>
              <Input
                id={f.key}
                value={values[f.key] || ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
              />
            </div>
          ))}

          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar alterações'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsProductDetails;