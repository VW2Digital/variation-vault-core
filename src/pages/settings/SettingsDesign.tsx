import { useState, useEffect, useMemo } from 'react';
import { fetchSetting, upsertSetting, getCurrentUser } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Image } from 'lucide-react';
import SettingsBackButton from './SettingsBackButton';
import SettingsSkeleton from '@/components/admin/settings/SettingsSkeleton';
import StickySaveBar from '@/components/admin/settings/StickySaveBar';

const TITLE_LIMIT = 60;
const DESC_LIMIT = 160;

const SettingsDesign = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [faviconUrl, setFaviconUrl] = useState('');
  const [storePublicUrl, setStorePublicUrl] = useState('');
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  // Snapshot of last-saved values, used to detect "dirty" state.
  const [initial, setInitial] = useState({
    storeName: '',
    logoUrl: '',
    faviconUrl: '',
    storePublicUrl: '',
    metaTitle: '',
    metaDescription: '',
  });

  useEffect(() => {
    Promise.all([
      fetchSetting('store_name'),
      fetchSetting('logo_url'),
      fetchSetting('favicon_url'),
      fetchSetting('store_public_url'),
      fetchSetting('meta_title'),
      fetchSetting('meta_description'),
    ]).then(([name, logo, favicon, publicUrl, title, desc]) => {
      const snap = {
        storeName: name || '',
        logoUrl: logo || '',
        faviconUrl: favicon || '',
        storePublicUrl: publicUrl || '',
        metaTitle: title || '',
        metaDescription: desc || '',
      };
      setStoreName(snap.storeName);
      setLogoUrl(snap.logoUrl);
      setFaviconUrl(snap.faviconUrl);
      setStorePublicUrl(snap.storePublicUrl);
      setMetaTitle(snap.metaTitle);
      setMetaDescription(snap.metaDescription);
      setInitial(snap);
    }).finally(() => setLoading(false));
  }, []);

  const isDirty = useMemo(() => (
    storeName !== initial.storeName ||
    logoUrl !== initial.logoUrl ||
    faviconUrl !== initial.faviconUrl ||
    storePublicUrl !== initial.storePublicUrl ||
    metaTitle !== initial.metaTitle ||
    metaDescription !== initial.metaDescription
  ), [storeName, logoUrl, faviconUrl, storePublicUrl, metaTitle, metaDescription, initial]);

  const handleDiscard = () => {
    setStoreName(initial.storeName);
    setLogoUrl(initial.logoUrl);
    setFaviconUrl(initial.faviconUrl);
    setStorePublicUrl(initial.storePublicUrl);
    setMetaTitle(initial.metaTitle);
    setMetaDescription(initial.metaDescription);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      await Promise.all([
        upsertSetting('store_name', storeName, user.id),
        upsertSetting('logo_url', logoUrl, user.id),
        upsertSetting('favicon_url', faviconUrl, user.id),
        upsertSetting('store_public_url', storePublicUrl.trim().replace(/\/+$/, ''), user.id),
        upsertSetting('meta_title', metaTitle, user.id),
        upsertSetting('meta_description', metaDescription, user.id),
      ]);
      setInitial({
        storeName,
        logoUrl,
        faviconUrl,
        storePublicUrl: storePublicUrl.trim().replace(/\/+$/, ''),
        metaTitle,
        metaDescription,
      });
      toast({ title: 'Configurações salvas!' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SettingsSkeleton cards={2} fieldsPerCard={3} />;

  const titleColor = metaTitle.length > TITLE_LIMIT ? 'text-destructive' : 'text-muted-foreground';
  const descColor = metaDescription.length > DESC_LIMIT ? 'text-destructive' : 'text-muted-foreground';
  const previewUrl = (storePublicUrl || 'https://suaempresa.com').replace(/^https?:\/\//, '');

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
          <div className="space-y-2">
            <Label>URL Pública da Loja</Label>
            <Input value={storePublicUrl} onChange={(e) => setStorePublicUrl(e.target.value)} placeholder="https://loja.seudominio.com" />
            <p className="text-xs text-muted-foreground">
              Usada em redirecionamentos de pagamento, links de e-mail e integrações externas quando o backend precisa gerar URLs públicas.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">SEO</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="meta-title">Meta Title</Label>
              <span className={`text-[11px] ${titleColor}`}>
                {metaTitle.length}/{TITLE_LIMIT}
              </span>
            </div>
            <Input
              id="meta-title"
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              placeholder="Título da página"
              maxLength={120}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="meta-description">Meta Description</Label>
              <span className={`text-[11px] ${descColor}`}>
                {metaDescription.length}/{DESC_LIMIT}
              </span>
            </div>
            <Textarea
              id="meta-description"
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              placeholder="Descrição que aparece nos resultados de busca"
              rows={3}
              maxLength={320}
            />
          </div>

          <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-1">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Pré-visualização no Google
            </p>
            <p className="text-[#1a0dab] dark:text-[#8ab4f8] text-base leading-snug truncate">
              {metaTitle || storeName || 'Título da página'}
            </p>
            <p className="text-[#006621] dark:text-emerald-400 text-xs truncate">{previewUrl}</p>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {metaDescription || 'A descrição que aparece aqui é o que os clientes vão ler nos resultados de busca antes de clicarem na sua loja.'}
            </p>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving || !isDirty} className="px-8">
        {saving ? 'Salvando...' : 'Salvar'}
      </Button>

      <StickySaveBar
        visible={isDirty}
        saving={saving}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    </div>
  );
};

export default SettingsDesign;
