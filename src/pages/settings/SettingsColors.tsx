import { useState, useEffect } from 'react';
import { fetchSetting, upsertSetting, getCurrentUser } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Palette } from 'lucide-react';
import SettingsBackButton from './SettingsBackButton';
import SettingsSkeleton from '@/components/admin/settings/SettingsSkeleton';

const SettingsColors = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [primaryColor, setPrimaryColor] = useState('');
  const [accentColor, setAccentColor] = useState('');

  useEffect(() => {
    Promise.all([
      fetchSetting('primary_color'),
      fetchSetting('accent_color'),
    ]).then(([primary, accent]) => {
      setPrimaryColor(primary || '#d4a853');
      setAccentColor(accent || '#b8942e');
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      await Promise.all([
        upsertSetting('primary_color', primaryColor, user.id),
        upsertSetting('accent_color', accentColor, user.id),
      ]);
      toast({ title: 'Cores salvas!' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SettingsSkeleton />;

  return (
    <div className="space-y-6 w-full">
      <SettingsBackButton title="Cores do Tema" description="Cor primária e identidade visual" />

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Palette className="w-5 h-5" /> Paleta de Cores
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Cor Primária</Label>
            <div className="flex items-center gap-3">
              <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-10 h-10 rounded border border-border cursor-pointer" />
              <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} placeholder="#d4a853" className="flex-1" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Cor de Destaque</Label>
            <div className="flex items-center gap-3">
              <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="w-10 h-10 rounded border border-border cursor-pointer" />
              <Input value={accentColor} onChange={(e) => setAccentColor(e.target.value)} placeholder="#b8942e" className="flex-1" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="px-8">
        {saving ? 'Salvando...' : 'Salvar'}
      </Button>
    </div>
  );
};

export default SettingsColors;
