import { useState, useEffect } from 'react';
import { fetchSetting, upsertSetting, getCurrentUser } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Image } from 'lucide-react';
import SettingsBackButton from './SettingsBackButton';

const SettingsDesign = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [faviconUrl, setFaviconUrl] = useState('');
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');

  useEffect(() => {
    Promise.all([
      fetchSetting('store_name'),
      fetchSetting('logo_url'),
      fetchSetting('favicon_url'),
      fetchSetting('meta_title'),
      fetchSetting('meta_description'),
    ]).then(([name, logo, favicon, title, desc]) => {
      setStoreName(name || '');
      setLogoUrl(logo || '');
      setFaviconUrl(favicon || '');
      setMetaTitle(title || '');
      setMetaDescription(desc || '');
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      await Promise.all([
        upsertSetting('store_name', storeName, user.id),
        upsertSetting('logo_url', logoUrl, user.id),
        upsertSetting('favicon_url', faviconUrl, user.id),
        upsertSetting('meta_title', metaTitle, user.id),
        upsertSetting('meta_description', metaDescription, user.id),
      ]);
      toast({ title: 'Configurações salvas!' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-6 w-full">
      <SettingsBackButton title="Logo & Identidade" description="Logo, nome da loja e SEO" />

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Image className="w-5 h-5" /> Identidade da Loja
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Nome da Loja</Label>
            <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Minha Loja" />
          </div>
          <div className="space-y-2">
            <Label>URL do Logo</Label>
            <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
            {logoUrl && <img src={logoUrl} alt="Logo preview" className="h-12 object-contain mt-2" />}
          </div>
          <div className="space-y-2">
            <Label>URL do Favicon</Label>
            <Input value={faviconUrl} onChange={(e) => setFaviconUrl(e.target.value)} placeholder="https://..." />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">SEO</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Meta Title</Label>
            <Input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} placeholder="Título da página" />
          </div>
          <div className="space-y-2">
            <Label>Meta Description</Label>
            <Input value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} placeholder="Descrição para SEO" />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="px-8">
        {saving ? 'Salvando...' : 'Salvar'}
      </Button>
    </div>
  );
};

export default SettingsDesign;
