import { useState, useEffect } from 'react';
import { fetchSetting, upsertSetting, getCurrentUser } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { FileText } from 'lucide-react';
import SettingsBackButton from './SettingsBackButton';

const SettingsFooter = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [footerText, setFooterText] = useState('');
  const [footerPhone, setFooterPhone] = useState('');
  const [footerEmail, setFooterEmail] = useState('');
  const [instagramUrl, setInstagramUrl] = useState('');
  const [facebookUrl, setFacebookUrl] = useState('');

  useEffect(() => {
    Promise.all([
      fetchSetting('footer_text'),
      fetchSetting('footer_phone'),
      fetchSetting('footer_email'),
      fetchSetting('instagram_url'),
      fetchSetting('facebook_url'),
    ]).then(([text, phone, email, ig, fb]) => {
      setFooterText(text || '');
      setFooterPhone(phone || '');
      setFooterEmail(email || '');
      setInstagramUrl(ig || '');
      setFacebookUrl(fb || '');
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      const uid = user.id;
      await Promise.all([
        upsertSetting('footer_text', footerText, uid),
        upsertSetting('footer_phone', footerPhone, uid),
        upsertSetting('footer_email', footerEmail, uid),
        upsertSetting('instagram_url', instagramUrl, uid),
        upsertSetting('facebook_url', facebookUrl, uid),
      ]);
      toast({ title: 'Configurações do rodapé salvas!' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  if (loading) return <p className="text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-6 w-full">
      <SettingsBackButton title="Rodapé & Informações Legais" description="Links do footer, termos e privacidade" />

      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><FileText className="w-5 h-5" /> Rodapé</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Texto do rodapé</Label>
            <Input value={footerText} onChange={(e) => setFooterText(e.target.value)} placeholder="© 2024 Minha Loja. Todos os direitos reservados." />
          </div>
          <div className="space-y-2">
            <Label>Telefone de contato</Label>
            <Input value={footerPhone} onChange={(e) => setFooterPhone(e.target.value)} placeholder="(11) 99999-9999" />
          </div>
          <div className="space-y-2">
            <Label>Email de contato</Label>
            <Input value={footerEmail} onChange={(e) => setFooterEmail(e.target.value)} placeholder="contato@minhaloja.com" />
          </div>
          <div className="space-y-2">
            <Label>Instagram URL</Label>
            <Input value={instagramUrl} onChange={(e) => setInstagramUrl(e.target.value)} placeholder="https://instagram.com/minhaloja" />
          </div>
          <div className="space-y-2">
            <Label>Facebook URL</Label>
            <Input value={facebookUrl} onChange={(e) => setFacebookUrl(e.target.value)} placeholder="https://facebook.com/minhaloja" />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="px-8">
        {saving ? 'Salvando...' : 'Salvar'}
      </Button>
    </div>
  );
};

export default SettingsFooter;
