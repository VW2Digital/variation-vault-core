import { useState, useEffect } from 'react';
import { fetchSetting, upsertSetting } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Phone } from 'lucide-react';

const SettingsPage = () => {
  const { toast } = useToast();
  const [whatsapp, setWhatsapp] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSetting('whatsapp_number')
      .then(setWhatsapp)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await upsertSetting('whatsapp_number', whatsapp);
      toast({ title: 'Configurações salvas!' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-6 w-full max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground">Configurações</h1>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Phone className="w-5 h-5" /> WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Número do WhatsApp (com código do país)</Label>
            <Input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="5511999999999"
            />
            <p className="text-xs text-muted-foreground">
              Formato: código do país + DDD + número. Ex: 5511999999999
            </p>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;
