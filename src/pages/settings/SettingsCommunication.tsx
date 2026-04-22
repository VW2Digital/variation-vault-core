import { useState, useEffect } from 'react';
import { fetchSetting, upsertSetting, getCurrentUser } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Phone, Mail, MessageSquare, Eye, EyeOff, Send, Loader2, BellRing, AlertTriangle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import SettingsBackButton from './SettingsBackButton';

const SettingsCommunication = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [whatsapp, setWhatsapp] = useState('');
  const [resendApiKey, setResendApiKey] = useState('');
  const [resendFromEmail, setResendFromEmail] = useState('');
  const [showResendKey, setShowResendKey] = useState(false);

  // Teste de envio de email
  const [testEmailTo, setTestEmailTo] = useState('');
  const [testEmailSubject, setTestEmailSubject] = useState('');
  const [testEmailMessage, setTestEmailMessage] = useState('');
  const [sendingTestEmail, setSendingTestEmail] = useState(false);

  const PUBLIC_EMAIL_DOMAINS = ['gmail.com','googlemail.com','hotmail.com','outlook.com','live.com','yahoo.com','yahoo.com.br','icloud.com','msn.com','bol.com.br','uol.com.br','terra.com.br'];
  const fromDomain = resendFromEmail.split('@')[1]?.toLowerCase() || '';
  const isPublicEmailDomain = PUBLIC_EMAIL_DOMAINS.includes(fromDomain);

  // Evolution API
  const [evolutionApiUrl, setEvolutionApiUrl] = useState('');
  const [evolutionApiKey, setEvolutionApiKey] = useState('');
  const [evolutionInstanceName, setEvolutionInstanceName] = useState('');
  const [showEvolutionKey, setShowEvolutionKey] = useState(false);
  const [testNumber, setTestNumber] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  // Notificação automática ao cliente após pagamento
  const [notifyCustomerOnPayment, setNotifyCustomerOnPayment] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchSetting('whatsapp_number'),
      fetchSetting('resend_api_key'),
      fetchSetting('resend_from_email'),
      fetchSetting('evolution_api_url'),
      fetchSetting('evolution_api_key'),
      fetchSetting('evolution_instance_name'),
      fetchSetting('notify_customer_on_payment'),
    ]).then(([wp, rKey, rFrom, evoUrl, evoKey, evoInstance, notifyFlag]) => {
      setWhatsapp(wp || '');
      setResendApiKey(rKey || '');
      setResendFromEmail(rFrom || 'onboarding@resend.dev');
      setEvolutionApiUrl(evoUrl || '');
      setEvolutionApiKey(evoKey || '');
      setEvolutionInstanceName(evoInstance || '');
      setNotifyCustomerOnPayment(notifyFlag !== 'false'); // default: ativado
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Not authenticated');
      const uid = user.id;
      await Promise.all([
        upsertSetting('whatsapp_number', whatsapp, uid),
        upsertSetting('resend_api_key', resendApiKey, uid),
        upsertSetting('resend_from_email', resendFromEmail, uid),
        upsertSetting('evolution_api_url', evolutionApiUrl, uid),
        upsertSetting('evolution_api_key', evolutionApiKey, uid),
        upsertSetting('evolution_instance_name', evolutionInstanceName, uid),
        upsertSetting('notify_customer_on_payment', notifyCustomerOnPayment ? 'true' : 'false', uid),
      ]);
      toast({ title: 'Configurações de comunicação salvas!' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  if (loading) return <p className="text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-6 w-full">
      <SettingsBackButton title="WhatsApp, Email & Mensagens" description="WhatsApp, Evolution API e Resend" />

      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Phone className="w-5 h-5" /> WhatsApp</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Número do WhatsApp (com código do país)</Label>
            <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, ''))} placeholder="5511999999999" inputMode="numeric" />
            <p className="text-xs text-muted-foreground">Formato: código do país + DDD + número. Ex: 5511999999999</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><BellRing className="w-5 h-5" /> Notificações Automáticas ao Cliente</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4 p-4 rounded-lg border border-border/50 bg-muted/30">
            <div className="space-y-1">
              <Label className="text-base">Enviar confirmação ao cliente após pagamento</Label>
              <p className="text-xs text-muted-foreground">
                Quando ativado, o cliente recebe automaticamente uma mensagem no WhatsApp e e-mail quando o pagamento for aprovado ou recusado (todos os gateways).
              </p>
            </div>
            <Switch checked={notifyCustomerOnPayment} onCheckedChange={setNotifyCustomerOnPayment} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Mail className="w-5 h-5" /> Resend - Email de Notificação</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>API Key do Resend</Label>
            <div className="relative">
              <Input type={showResendKey ? 'text' : 'password'} value={resendApiKey} onChange={(e) => setResendApiKey(e.target.value)} placeholder="re_..." className="pr-10" />
              <button type="button" onClick={() => setShowResendKey(!showResendKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showResendKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email de envio (From)</Label>
            <Input value={resendFromEmail} onChange={(e) => setResendFromEmail(e.target.value)} placeholder="onboarding@resend.dev" />
            {isPublicEmailDomain && (
              <div className="flex items-start gap-2 p-3 rounded-md border border-destructive/40 bg-destructive/10 text-destructive">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold">Domínio público não é aceito pelo Resend</p>
                  <p>O Resend bloqueia envios usando endereços @{fromDomain}. Os emails serão enviados automaticamente via <code className="font-mono">onboarding@resend.dev</code> e o seu email será adicionado como <strong>Reply-To</strong>.</p>
                  <p>Para usar seu próprio domínio (ex.: <code className="font-mono">noreply@seudominio.com.br</code>), verifique-o em <a href="https://resend.com/domains" target="_blank" rel="noreferrer" className="underline">resend.com/domains</a>.</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><MessageSquare className="w-5 h-5" /> Evolution API - Mensagens WhatsApp</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>URL da API</Label>
            <Input value={evolutionApiUrl} onChange={(e) => setEvolutionApiUrl(e.target.value)} placeholder="https://evocooli.vw2.shop" />
          </div>
          <div className="space-y-2">
            <Label>Nome da Instância</Label>
            <Input value={evolutionInstanceName} onChange={(e) => setEvolutionInstanceName(e.target.value)} placeholder="minha-instancia" />
          </div>
          <div className="space-y-2">
            <Label>API Key (Global)</Label>
            <div className="relative">
              <Input type={showEvolutionKey ? 'text' : 'password'} value={evolutionApiKey} onChange={(e) => setEvolutionApiKey(e.target.value)} placeholder="Sua apikey global" className="pr-10" />
              <button type="button" onClick={() => setShowEvolutionKey(!showEvolutionKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showEvolutionKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="pt-4 border-t border-border/50">
            <p className="text-sm font-medium text-foreground mb-3">Enviar mensagem de teste</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Número (com código do país)</Label><Input value={testNumber} onChange={(e) => setTestNumber(e.target.value.replace(/\D/g, ''))} placeholder="559999999999" inputMode="numeric" /></div>
              <div className="space-y-2"><Label>Mensagem</Label><Input value={testMessage} onChange={(e) => setTestMessage(e.target.value)} placeholder="Olá, teste de envio!" /></div>
            </div>
            <Button type="button" variant="outline" className="mt-3 flex items-center gap-2" disabled={sendingTest || !testNumber || !testMessage || !evolutionApiUrl || !evolutionApiKey || !evolutionInstanceName} onClick={async () => {
              setSendingTest(true);
              try {
                const { data, error } = await supabase.functions.invoke('evolution-send-message', { body: { number: testNumber, text: testMessage } });
                if (error) throw new Error(error.message);
                if (data?.error) throw new Error(data.error);
                toast({ title: 'Mensagem enviada com sucesso!' });
              } catch (err: any) {
                toast({ title: 'Erro ao enviar', description: err.message, variant: 'destructive' });
              } finally { setSendingTest(false); }
            }}>
              {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sendingTest ? 'Enviando...' : 'Enviar Teste'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="px-8">
        {saving ? 'Salvando...' : 'Salvar'}
      </Button>
    </div>
  );
};

export default SettingsCommunication;
