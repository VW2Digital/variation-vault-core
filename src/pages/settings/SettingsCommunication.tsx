import { useState, useEffect } from 'react';
import { fetchSetting, upsertSetting, getCurrentUser } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Phone, Mail, MessageSquare, Eye, EyeOff, Send, Loader2, BellRing, AlertTriangle, Zap, CheckCircle2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import SettingsBackButton from './SettingsBackButton';
import SettingsSkeleton from '@/components/admin/settings/SettingsSkeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const SettingsCommunication = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [whatsapp, setWhatsapp] = useState('');

  // SMTP Hostinger (envio de e-mails)
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('465');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFromEmail, setSmtpFromEmail] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('');
  const [smtpSecure, setSmtpSecure] = useState(true);
  const [showSmtpPass, setShowSmtpPass] = useState(false);

  // Teste de envio de email
  const [testEmailTo, setTestEmailTo] = useState('');
  const [testEmailSubject, setTestEmailSubject] = useState('');
  const [testEmailMessage, setTestEmailMessage] = useState('');
  const [sendingTestEmail, setSendingTestEmail] = useState(false);

  // Ativação dos triggers de envio automático de email
  const [installingTriggerKey, setInstallingTriggerKey] = useState(false);
  const [triggerKeyInstalled, setTriggerKeyInstalled] = useState(false);

  const PUBLIC_EMAIL_DOMAINS = ['gmail.com','googlemail.com','hotmail.com','outlook.com','live.com','yahoo.com','yahoo.com.br','icloud.com','msn.com','bol.com.br','uol.com.br','terra.com.br'];
  const fromDomain = smtpFromEmail.split('@')[1]?.toLowerCase() || '';
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
      fetchSetting('smtp_host'),
      fetchSetting('smtp_port'),
      fetchSetting('smtp_user'),
      fetchSetting('smtp_pass'),
      fetchSetting('smtp_from_email'),
      fetchSetting('smtp_from_name'),
      fetchSetting('smtp_secure'),
      fetchSetting('evolution_api_url'),
      fetchSetting('evolution_api_key'),
      fetchSetting('evolution_instance_name'),
      fetchSetting('notify_customer_on_payment'),
      fetchSetting('service_role_key_for_triggers'),
    ]).then(([wp, sHost, sPort, sUser, sPass, sFrom, sFromName, sSecure, evoUrl, evoKey, evoInstance, notifyFlag, triggerKey]) => {
      setWhatsapp(wp || '');
      setSmtpHost(sHost || 'smtp.hostinger.com');
      setSmtpPort(sPort || '465');
      setSmtpUser(sUser || '');
      setSmtpPass(sPass || '');
      setSmtpFromEmail(sFrom || '');
      setSmtpFromName(sFromName || '');
      setSmtpSecure(sSecure ? sSecure !== 'false' : true);
      setEvolutionApiUrl(evoUrl || '');
      setEvolutionApiKey(evoKey || '');
      setEvolutionInstanceName(evoInstance || '');
      setNotifyCustomerOnPayment(notifyFlag !== 'false'); // default: ativado
      setTriggerKeyInstalled(Boolean(triggerKey));
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
        upsertSetting('smtp_host', smtpHost, uid),
        upsertSetting('smtp_port', smtpPort, uid),
        upsertSetting('smtp_user', smtpUser, uid),
        upsertSetting('smtp_pass', smtpPass, uid),
        upsertSetting('smtp_from_email', smtpFromEmail, uid),
        upsertSetting('smtp_from_name', smtpFromName, uid),
        upsertSetting('smtp_secure', smtpSecure ? 'true' : 'false', uid),
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

  if (loading) return <SettingsSkeleton />;

  return (
    <div className="space-y-6 w-full">
      <SettingsBackButton title="WhatsApp, Email & Mensagens" description="WhatsApp, Evolution API e SMTP Hostinger" />

      <Tabs defaultValue="email" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-2xl">
          <TabsTrigger value="email" className="gap-1.5">
            <Mail className="w-4 h-4" /> E-mail
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-1.5">
            <Phone className="w-4 h-4" /> WhatsApp
          </TabsTrigger>
          <TabsTrigger value="auto" className="gap-1.5">
            <Zap className="w-4 h-4" /> Disparo Automático
          </TabsTrigger>
        </TabsList>

        <TabsContent value="whatsapp" className="space-y-6 mt-6">
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
        </TabsContent>

        <TabsContent value="email" className="space-y-6 mt-6">
      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Mail className="w-5 h-5" /> SMTP Hostinger - Envio de E-mails</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>SMTP Host</Label>
              <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.hostinger.com" />
            </div>
            <div className="space-y-2">
              <Label>Porta</Label>
              <Input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value.replace(/\D/g, ''))} placeholder="465" inputMode="numeric" />
              <p className="text-xs text-muted-foreground">465 (SSL) ou 587 (TLS)</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Usuário SMTP (e-mail completo)</Label>
            <Input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="no-reply@seudominio.com" />
          </div>

          <div className="space-y-2">
            <Label>Senha SMTP</Label>
            <div className="relative">
              <Input type={showSmtpPass ? 'text' : 'password'} value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} placeholder="Senha da caixa de e-mail Hostinger" className="pr-10" />
              <button type="button" onClick={() => setShowSmtpPass(!showSmtpPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showSmtpPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>E-mail remetente (From)</Label>
              <Input value={smtpFromEmail} onChange={(e) => setSmtpFromEmail(e.target.value)} placeholder="no-reply@seudominio.com" />
            </div>
            <div className="space-y-2">
              <Label>Nome do remetente</Label>
              <Input value={smtpFromName} onChange={(e) => setSmtpFromName(e.target.value)} placeholder="Liberty Pharma" />
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/30">
            <div className="space-y-0.5">
              <Label className="text-sm">Conexão SSL/TLS</Label>
              <p className="text-xs text-muted-foreground">Ative para porta 465 (SSL). Desative para 587 (STARTTLS).</p>
            </div>
            <Switch checked={smtpSecure} onCheckedChange={setSmtpSecure} />
          </div>

          {isPublicEmailDomain && (
            <div className="flex items-start gap-2 p-3 rounded-md border border-destructive/40 bg-destructive/10 text-destructive">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="text-xs space-y-1">
                <p className="font-semibold">Use um e-mail de domínio próprio</p>
                <p>Endereços @{fromDomain} (Gmail, Outlook etc.) caem em spam ou são rejeitados. Use um e-mail do seu domínio configurado na Hostinger.</p>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-border/50">
            <p className="text-sm font-medium text-foreground mb-3">Enviar email de teste</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email do destinatário</Label>
                <Input
                  type="email"
                  value={testEmailTo}
                  onChange={(e) => setTestEmailTo(e.target.value)}
                  placeholder="seuemail@exemplo.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Assunto (opcional)</Label>
                <Input
                  value={testEmailSubject}
                  onChange={(e) => setTestEmailSubject(e.target.value)}
                  placeholder="✅ Teste de envio - Resend"
                />
              </div>
            </div>
            <div className="space-y-2 mt-4">
              <Label>Mensagem (opcional)</Label>
              <Input
                value={testEmailMessage}
                onChange={(e) => setTestEmailMessage(e.target.value)}
                placeholder="Este é um e-mail de teste enviado pelo painel administrativo."
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-3 flex items-center gap-2"
              disabled={sendingTestEmail || !testEmailTo || !smtpHost || !smtpUser || !smtpPass}
              onClick={async () => {
                setSendingTestEmail(true);
                try {
                  const { data, error } = await supabase.functions.invoke('test-resend-email', {
                    body: {
                      to: testEmailTo,
                      subject: testEmailSubject,
                      message: testEmailMessage,
                    },
                  });
                  if (error) throw new Error(error.message);
                  if (data?.error) throw new Error(data.error);
                  toast({
                    title: 'Email enviado com sucesso!',
                    description: `Enviado via SMTP (${smtpHost}) para ${testEmailTo}. Verifique a caixa de entrada (e o spam).`,
                  });
                } catch (err: any) {
                  toast({ title: 'Erro ao enviar email', description: err.message, variant: 'destructive' });
                } finally { setSendingTestEmail(false); }
              }}
            >
              {sendingTestEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sendingTestEmail ? 'Enviando...' : 'Enviar Email de Teste'}
            </Button>
            {(!smtpHost || !smtpUser || !smtpPass) && (
              <p className="text-xs text-muted-foreground mt-2">
                Preencha host, usuário e senha SMTP e salve antes de enviar testes.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="w-5 h-5" /> Disparo Automático de Emails
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Ativa o envio automático de emails diretamente pelo banco de dados sempre
            que um pedido for criado, pago, recusado ou tiver código de rastreio
            adicionado. Isso garante o envio mesmo se o webhook do gateway falhar.
          </p>
          {triggerKeyInstalled ? (
            <div className="flex items-center gap-2 text-sm text-primary bg-primary/10 border border-primary/30 rounded-md px-3 py-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>Triggers ativos. Emails automáticos estão sendo disparados pelo banco.</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted border border-border rounded-md px-3 py-2">
              <AlertTriangle className="w-4 h-4" />
              <span>Triggers ainda não foram ativados. Clique no botão abaixo para ativar.</span>
            </div>
          )}
          <Button
            type="button"
            variant={triggerKeyInstalled ? 'outline' : 'default'}
            className="flex items-center gap-2"
            disabled={installingTriggerKey}
            onClick={async () => {
              setInstallingTriggerKey(true);
              try {
                const { data, error } = await supabase.functions.invoke('install-trigger-key');
                if (error) throw new Error(error.message);
                if (data?.error) throw new Error(data.error);
                setTriggerKeyInstalled(true);
                toast({
                  title: 'Triggers ativados!',
                  description: data?.message || 'Pedidos novos enviarão emails automaticamente.',
                });
              } catch (err: any) {
                toast({ title: 'Erro ao ativar triggers', description: err.message, variant: 'destructive' });
              } finally {
                setInstallingTriggerKey(false);
              }
            }}
          >
            {installingTriggerKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {installingTriggerKey
              ? 'Ativando...'
              : triggerKeyInstalled
                ? 'Reativar / Atualizar Chave'
                : 'Ativar Disparo Automático'}
          </Button>
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
