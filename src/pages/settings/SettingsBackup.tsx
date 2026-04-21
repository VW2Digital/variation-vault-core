import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Download, Upload, Database, AlertTriangle, Loader2, CheckCircle2, Mail, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const TABLES = [
  'addresses', 'banner_slides', 'banners', 'cart_abandonment_logs', 'cart_items',
  'coupon_products', 'coupons', 'orders', 'payment_links', 'payment_logs',
  'popups', 'product_variations', 'products', 'profiles', 'reviews',
  'shipping_logs', 'site_settings', 'support_messages', 'support_tickets',
  'user_roles', 'video_testimonials', 'wholesale_prices',
];

const SettingsBackup = () => {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [importMode, setImportMode] = useState<'insert' | 'upsert'>('upsert');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [lastResult, setLastResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [recipientEmail, setRecipientEmail] = useState('libertyluminaepharma@gmail.com');
  const [savingEmail, setSavingEmail] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'backup_recipient_email')
        .maybeSingle();
      if (data?.value) setRecipientEmail(data.value);
    })();
  }, []);

  const saveRecipient = async () => {
    setSavingEmail(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');
      const { error } = await supabase
        .from('site_settings')
        .upsert({ key: 'backup_recipient_email', value: recipientEmail, user_id: user.id }, { onConflict: 'key' });
      if (error) throw error;
      toast({ title: 'Email salvo', description: 'O destinatário do backup foi atualizado.' });
    } catch (err) {
      toast({ title: 'Erro', description: String(err), variant: 'destructive' });
    } finally {
      setSavingEmail(false);
    }
  };

  const sendTestNow = async () => {
    setSendingTest(true);
    try {
      const { data, error } = await supabase.functions.invoke('backup-weekly-email', { body: {} });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Falha desconhecida');
      toast({ title: 'Backup enviado', description: `${data.filename} (${data.sizeMB}MB) enviado para ${data.recipient}` });
    } catch (err) {
      toast({ title: 'Erro ao enviar', description: String(err), variant: 'destructive' });
    } finally {
      setSendingTest(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error('Sessão expirada');

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/backup-csv?action=export`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `backup-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast({ title: 'Backup gerado', description: 'O arquivo ZIP foi baixado.' });
    } catch (err) {
      toast({ title: 'Erro ao baixar backup', description: String(err), variant: 'destructive' });
    } finally {
      setDownloading(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedTable || !csvFile) {
      toast({ title: 'Dados incompletos', description: 'Selecione tabela e arquivo CSV.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    setLastResult(null);
    try {
      const csv = await csvFile.text();
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error('Sessão expirada');

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/backup-csv?action=import`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ table: selectedTable, csv, mode: importMode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) {
        throw new Error(data?.error || `Erro ${res.status}`);
      }

      setLastResult({ ok: true, message: `${data.rows} linhas processadas em "${selectedTable}".` });
      toast({ title: 'Importação concluída', description: `${data.rows} linhas em ${selectedTable}.` });
      setCsvFile(null);
      const input = document.getElementById('csv-input') as HTMLInputElement;
      if (input) input.value = '';
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLastResult({ ok: false, message: msg });
      toast({ title: 'Erro ao importar', description: msg, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6 w-full max-w-4xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
          <Database className="w-6 h-6" /> BACKUP & RESTAURAÇÃO
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Exporte todas as tabelas em ZIP de CSVs ou restaure uma tabela específica a partir de um arquivo CSV.
        </p>
      </div>

      {/* Download */}
      <Card className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-md bg-primary/10">
            <Download className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-foreground">Baixar backup completo</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Gera um ZIP com 1 arquivo CSV por tabela ({TABLES.length} tabelas no total). Ideal para arquivar antes de mudanças importantes.
            </p>
          </div>
        </div>
        <Button onClick={handleDownload} disabled={downloading} className="gap-2">
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {downloading ? 'Gerando backup...' : 'Baixar backup ZIP'}
        </Button>
      </Card>

      {/* Backup automático semanal */}
      <Card className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-md bg-primary/10">
            <Mail className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-foreground">Backup automático semanal por email</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Toda <strong>segunda-feira às 06:00</strong> (horário de Brasília) o sistema gera o ZIP completo e envia anexado para o email configurado.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="recipient">Email destinatário</Label>
          <div className="flex gap-2">
            <Input
              id="recipient"
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="admin@empresa.com"
            />
            <Button onClick={saveRecipient} disabled={savingEmail} variant="outline">
              {savingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
            </Button>
          </div>
        </div>

        <div className="pt-2 border-t border-border">
          <Button onClick={sendTestNow} disabled={sendingTest} variant="secondary" className="gap-2">
            {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sendingTest ? 'Enviando...' : 'Enviar backup de teste agora'}
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Útil para validar a configuração. Pode levar até 30 segundos.
          </p>
        </div>
      </Card>

      {/* Upload */}
      <Card className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-md bg-amber-500/10">
            <Upload className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-foreground">Restaurar tabela a partir de CSV</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Importa um CSV (com cabeçalho) para uma tabela específica. Use "Mesclar" para atualizar registros com mesmo ID, ou "Inserir" para criar novos.
            </p>
          </div>
        </div>

        <Alert className="border-amber-500/40 bg-amber-500/5">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <AlertDescription className="text-sm">
            Atenção: imports podem sobrescrever dados existentes. Faça o backup ZIP antes!
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="table-select">Tabela de destino</Label>
            <Select value={selectedTable} onValueChange={setSelectedTable}>
              <SelectTrigger id="table-select">
                <SelectValue placeholder="Selecione a tabela" />
              </SelectTrigger>
              <SelectContent>
                {TABLES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Modo de importação</Label>
            <RadioGroup value={importMode} onValueChange={(v) => setImportMode(v as 'insert' | 'upsert')}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="upsert" id="upsert" />
                <Label htmlFor="upsert" className="font-normal cursor-pointer">
                  Mesclar (upsert por id) — atualiza existentes, insere novos
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="insert" id="insert" />
                <Label htmlFor="insert" className="font-normal cursor-pointer">
                  Apenas inserir — falha se houver IDs duplicados
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="csv-input">Arquivo CSV</Label>
            <input
              id="csv-input"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
            />
            {csvFile && (
              <p className="text-xs text-muted-foreground">
                Selecionado: <strong>{csvFile.name}</strong> ({(csvFile.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          <Button
            onClick={handleUpload}
            disabled={uploading || !selectedTable || !csvFile}
            className="gap-2"
            variant="default"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Importando...' : 'Importar CSV'}
          </Button>

          {lastResult && (
            <Alert className={lastResult.ok ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-destructive/40 bg-destructive/5'}>
              {lastResult.ok ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-destructive" />
              )}
              <AlertDescription className="text-sm">{lastResult.message}</AlertDescription>
            </Alert>
          )}
        </div>
      </Card>
    </div>
  );
};

export default SettingsBackup;
