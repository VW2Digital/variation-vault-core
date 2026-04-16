import { useState, useEffect } from 'react';
import { fetchSetting, upsertSetting, getCurrentUser } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Trash2, Plus, ShieldCheck, CreditCard, Shield, Truck, Award, Star, Heart, Package, Lock, BadgeCheck, Zap, Gift, ThumbsUp } from 'lucide-react';
import SettingsBackButton from './SettingsBackButton';

export const TRUST_BAR_ICONS = {
  ShieldCheck,
  CreditCard,
  Shield,
  Truck,
  Award,
  Star,
  Heart,
  Package,
  Lock,
  BadgeCheck,
  Zap,
  Gift,
  ThumbsUp,
} as const;

export type TrustBarIconName = keyof typeof TRUST_BAR_ICONS;

export interface TrustBarItem {
  icon: TrustBarIconName;
  title: string;
  desc: string;
}

export const DEFAULT_TRUST_BAR: TrustBarItem[] = [
  { icon: 'ShieldCheck', title: 'QUALIDADE GARANTIDA', desc: 'Controle e qualificação de alto padrão.' },
  { icon: 'CreditCard', title: 'PAGAMENTO FACILITADO', desc: 'Até 3x sem juros no cartão.' },
  { icon: 'Shield', title: 'COMPRA SEGURA', desc: 'Ambiente seguro e certificado.' },
  { icon: 'Truck', title: 'FRETE GRÁTIS', desc: 'Em compras acima de R$299 para todo o Brasil.' },
];

const SettingsTrustBar = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<TrustBarItem[]>(DEFAULT_TRUST_BAR);

  useEffect(() => {
    fetchSetting('trust_bar_items').then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) setItems(parsed);
        } catch {
          // ignore parse error, use defaults
        }
      }
    }).finally(() => setLoading(false));
  }, []);

  const updateItem = (index: number, field: keyof TrustBarItem, value: string) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const addItem = () => {
    setItems((prev) => [...prev, { icon: 'ShieldCheck', title: 'NOVO ITEM', desc: 'Descrição do item.' }]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Não autenticado');
      await upsertSetting('trust_bar_items', JSON.stringify(items), user.id);
      toast({ title: 'Trust Bar salva!' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-6 w-full">
      <SettingsBackButton title="Trust Bar (Catálogo)" description="Edite os itens da barra de destaques abaixo do banner" />

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" /> Itens da Trust Bar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((item, index) => {
            const Icon = TRUST_BAR_ICONS[item.icon] ?? ShieldCheck;
            return (
              <div key={index} className="border border-border/50 rounded-lg p-4 space-y-3 bg-muted/20">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-card rounded-lg p-2 shadow-sm">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <span className="text-sm font-semibold">Item {index + 1}</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeItem(index)} aria-label="Remover item">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Ícone</Label>
                    <Select value={item.icon} onValueChange={(v) => updateItem(index, 'icon', v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(TRUST_BAR_ICONS).map((name) => (
                          <SelectItem key={name} value={name}>{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Título</Label>
                    <Input value={item.title} onChange={(e) => updateItem(index, 'title', e.target.value)} placeholder="QUALIDADE GARANTIDA" />
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Input value={item.desc} onChange={(e) => updateItem(index, 'desc', e.target.value)} placeholder="Texto curto..." />
                  </div>
                </div>
              </div>
            );
          })}

          <Button variant="outline" onClick={addItem} className="w-full">
            <Plus className="w-4 h-4 mr-2" /> Adicionar item
          </Button>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="px-8">
        {saving ? 'Salvando...' : 'Salvar'}
      </Button>
    </div>
  );
};

export default SettingsTrustBar;
