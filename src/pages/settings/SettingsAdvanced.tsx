import { useState, useEffect } from 'react';
import { fetchSetting, upsertSetting, getCurrentUser } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Code } from 'lucide-react';
import SettingsBackButton from './SettingsBackButton';

const SettingsAdvanced = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [chatWidgetCode, setChatWidgetCode] = useState('');
  const [headScript, setHeadScript] = useState('');

  useEffect(() => {
    Promise.all([
      fetchSetting('chat_widget_code'),
      fetchSetting('head_script'),
    ]).then(([widget, head]) => {
      setChatWidgetCode(widget || '');
      setHeadScript(head || '');
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      const uid = user.id;
      await Promise.all([
        upsertSetting('chat_widget_code', chatWidgetCode, uid),
        upsertSetting('head_script', headScript, uid),
      ]);
      toast({ title: 'Configurações avançadas salvas!' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  if (loading) return <p className="text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-6 w-full">
      <SettingsBackButton title="Scripts & Widgets" description="Widget de chat, scripts customizados e configurações técnicas" />

      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Code className="w-5 h-5" /> Widget de Chat (CRM)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Código embed do widget</Label>
            <p className="text-xs text-muted-foreground">Cole aqui o código HTML/JavaScript do widget de chat do seu CRM.</p>
            <textarea
              className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono"
              value={chatWidgetCode}
              onChange={(e) => setChatWidgetCode(e.target.value)}
              placeholder='<script src="https://seu-crm.com/widget.js"></script>'
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Code className="w-5 h-5" /> Scripts no Head</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Scripts para o &lt;head&gt;</Label>
            <p className="text-xs text-muted-foreground">Google Analytics, Facebook Pixel, etc. Serão inseridos no &lt;head&gt; de todas as páginas.</p>
            <textarea
              className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono"
              value={headScript}
              onChange={(e) => setHeadScript(e.target.value)}
              placeholder='<!-- Google Analytics -->'
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="px-8">
        {saving ? 'Salvando...' : 'Salvar'}
      </Button>
    </div>
  );
};

export default SettingsAdvanced;
