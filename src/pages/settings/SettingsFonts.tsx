import { useState, useEffect } from 'react';
import { fetchSetting, upsertSetting, getCurrentUser } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Type } from 'lucide-react';
import SettingsBackButton from './SettingsBackButton';
import SettingsSkeleton from '@/components/admin/settings/SettingsSkeleton';

const SettingsFonts = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [headingFont, setHeadingFont] = useState('');
  const [bodyFont, setBodyFont] = useState('');

  useEffect(() => {
    Promise.all([
      fetchSetting('heading_font'),
      fetchSetting('body_font'),
    ]).then(([heading, body]) => {
      setHeadingFont(heading || 'Inter');
      setBodyFont(body || 'Inter');
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      await Promise.all([
        upsertSetting('heading_font', headingFont, user.id),
        upsertSetting('body_font', bodyFont, user.id),
      ]);
      toast({ title: 'Fontes salvas!' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SettingsSkeleton />;

  return (
    <div className="space-y-6 w-full">
      <SettingsBackButton title="Fontes" description="Fonte dos títulos e do corpo do texto" />

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Type className="w-5 h-5" /> Tipografia
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Fonte dos Títulos</Label>
            <Input value={headingFont} onChange={(e) => setHeadingFont(e.target.value)} placeholder="Inter" />
            <p className="text-xs text-muted-foreground">Nome da fonte do Google Fonts para títulos</p>
          </div>
          <div className="space-y-2">
            <Label>Fonte do Corpo</Label>
            <Input value={bodyFont} onChange={(e) => setBodyFont(e.target.value)} placeholder="Inter" />
            <p className="text-xs text-muted-foreground">Nome da fonte do Google Fonts para o corpo do texto</p>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="px-8">
        {saving ? 'Salvando...' : 'Salvar'}
      </Button>
    </div>
  );
};

export default SettingsFonts;
