import { useState, useEffect } from 'react';
import { fetchSetting, upsertSetting, getCurrentUser } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Code, Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import SettingsBackButton from './SettingsBackButton';
import DeployUpdateCard from '@/components/admin/DeployUpdateCard';
import SiteUrlCard from '@/components/admin/SiteUrlCard';

interface ScriptEntry {
  id: string;
  label: string;
  code: string;
}

const generateId = () => crypto.randomUUID();

const parseScripts = (raw: string): ScriptEntry[] => {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* ignore */ }
  if (raw?.trim()) return [{ id: generateId(), label: 'Script 1', code: raw }];
  return [];
};

const ScriptList = ({
  scripts,
  onChange,
  placeholder,
}: {
  scripts: ScriptEntry[];
  onChange: (s: ScriptEntry[]) => void;
  placeholder: string;
}) => {
  const addScript = () => {
    onChange([...scripts, { id: generateId(), label: `Script ${scripts.length + 1}`, code: '' }]);
  };

  const removeScript = (id: string) => {
    onChange(scripts.filter((s) => s.id !== id));
  };

  const updateScript = (id: string, field: 'label' | 'code', value: string) => {
    onChange(scripts.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  return (
    <div className="space-y-4">
      {scripts.map((script, index) => (
        <div key={script.id} className="space-y-2 border border-border/50 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <Input
              className="flex-1 font-medium"
              value={script.label}
              onChange={(e) => updateScript(script.id, 'label', e.target.value)}
              placeholder={`Nome do script ${index + 1}`}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeScript(script.id)}
              className="text-destructive hover:text-destructive shrink-0"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
          <textarea
            className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono"
            value={script.code}
            onChange={(e) => updateScript(script.id, 'code', e.target.value)}
            placeholder={placeholder}
          />
        </div>
      ))}
      <Button variant="outline" onClick={addScript} className="w-full gap-2">
        <Plus className="w-4 h-4" /> Adicionar script
      </Button>
    </div>
  );
};

const SettingsAdvanced = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [chatWidgetCode, setChatWidgetCode] = useState('');
  const [headScripts, setHeadScripts] = useState<ScriptEntry[]>([]);
  const [footerScripts, setFooterScripts] = useState<ScriptEntry[]>([]);

  useEffect(() => {
    Promise.all([
      fetchSetting('chat_widget_code'),
      fetchSetting('head_script'),
      fetchSetting('footer_script'),
    ]).then(([widget, head, footer]) => {
      setChatWidgetCode(widget || '');
      setHeadScripts(parseScripts(head || ''));
      setFooterScripts(parseScripts(footer || ''));
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
        upsertSetting('head_script', JSON.stringify(headScripts), uid),
        upsertSetting('footer_script', JSON.stringify(footerScripts), uid),
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

      <SiteUrlCard />

      <DeployUpdateCard />

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
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">Google Analytics, Facebook Pixel, etc. Serão inseridos no &lt;head&gt; de todas as páginas.</p>
          <ScriptList
            scripts={headScripts}
            onChange={setHeadScripts}
            placeholder='<!-- Google Analytics -->'
          />
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Code className="w-5 h-5" /> Scripts no Footer</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">Scripts que serão inseridos antes do &lt;/body&gt;. Ideal para pixels de conversão, chatbots, etc.</p>
          <ScriptList
            scripts={footerScripts}
            onChange={setFooterScripts}
            placeholder='<!-- Pixel de conversão -->'
          />
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="px-8">
        {saving ? 'Salvando...' : 'Salvar'}
      </Button>
    </div>
  );
};

export default SettingsAdvanced;
