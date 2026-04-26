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
import { Trash2, Plus, ShieldCheck, CreditCard, Shield, Truck, Award, Star, Heart, Package, Lock, BadgeCheck, Zap, Gift, ThumbsUp, GripVertical } from 'lucide-react';
import SettingsBackButton from './SettingsBackButton';
import SettingsSkeleton from '@/components/admin/settings/SettingsSkeleton';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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
  id?: string;
  icon: TrustBarIconName;
  title: string;
  desc: string;
  color?: string;
}

export const DEFAULT_TRUST_BAR: TrustBarItem[] = [
  { icon: 'ShieldCheck', title: 'QUALIDADE GARANTIDA', desc: 'Controle e qualificação de alto padrão.', color: '#D4A017' },
  { icon: 'CreditCard', title: 'PAGAMENTO FACILITADO', desc: 'Até 3x sem juros no cartão.', color: '#D4A017' },
  { icon: 'Shield', title: 'COMPRA SEGURA', desc: 'Ambiente seguro e certificado.', color: '#D4A017' },
  { icon: 'Truck', title: 'FRETE GRÁTIS', desc: 'Em compras acima de R$299 para todo o Brasil.', color: '#D4A017' },
];

const ensureIds = (arr: TrustBarItem[]): TrustBarItem[] =>
  arr.map((it, i) => ({ ...it, id: it.id || `item-${i}-${Date.now()}-${Math.random()}` }));

interface SortableItemProps {
  item: TrustBarItem;
  index: number;
  onUpdate: (index: number, field: keyof TrustBarItem, value: string) => void;
  onRemove: (index: number) => void;
}

const SortableItem = ({ item, index, onUpdate, onRemove }: SortableItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id!,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const Icon = TRUST_BAR_ICONS[item.icon] ?? ShieldCheck;
  const color = item.color || '#D4A017';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border border-border/50 rounded-lg p-4 space-y-3 bg-muted/20"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing touch-none p-1 text-muted-foreground hover:text-foreground"
            {...attributes}
            {...listeners}
            aria-label="Arrastar para reordenar"
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <div className="bg-card rounded-lg p-2 shadow-sm">
            <Icon className="w-5 h-5" style={{ color }} />
          </div>
          <span className="text-sm font-semibold">Item {index + 1}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => onRemove(index)} aria-label="Remover item">
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="space-y-2">
          <Label>Ícone</Label>
          <Select value={item.icon} onValueChange={(v) => onUpdate(index, 'icon', v)}>
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
          <Label>Cor do ícone</Label>
          <div className="flex items-center gap-2">
            <Input
              type="color"
              value={color}
              onChange={(e) => onUpdate(index, 'color', e.target.value)}
              className="w-12 h-10 p-1 cursor-pointer shrink-0"
            />
            <Input
              type="text"
              value={color}
              onChange={(e) => onUpdate(index, 'color', e.target.value)}
              placeholder="#D4A017"
              className="flex-1"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Título</Label>
          <Input value={item.title} onChange={(e) => onUpdate(index, 'title', e.target.value)} placeholder="QUALIDADE GARANTIDA" />
        </div>
        <div className="space-y-2">
          <Label>Descrição</Label>
          <Input value={item.desc} onChange={(e) => onUpdate(index, 'desc', e.target.value)} placeholder="Texto curto..." />
        </div>
      </div>
    </div>
  );
};

export const DEFAULT_TRUST_BAR_BG = 'hsl(var(--secondary) / 0.5)';
export const DEFAULT_TRUST_BAR_SPEED = 20;

const SettingsTrustBar = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<TrustBarItem[]>(ensureIds(DEFAULT_TRUST_BAR));
  const [bgColor, setBgColor] = useState<string>(DEFAULT_TRUST_BAR_BG);
  const [speed, setSpeed] = useState<number>(DEFAULT_TRUST_BAR_SPEED);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    Promise.all([
      fetchSetting('trust_bar_items'),
      fetchSetting('trust_bar_bg'),
      fetchSetting('trust_bar_speed'),
    ]).then(([rawItems, rawBg, rawSpeed]) => {
      if (rawItems) {
        try {
          const parsed = JSON.parse(rawItems);
          if (Array.isArray(parsed) && parsed.length > 0) setItems(ensureIds(parsed));
        } catch { /* ignore */ }
      }
      if (rawBg) setBgColor(rawBg);
      if (rawSpeed) {
        const n = Number(rawSpeed);
        if (!Number.isNaN(n) && n >= 5 && n <= 120) setSpeed(n);
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
    setItems((prev) => [
      ...prev,
      {
        id: `item-${prev.length}-${Date.now()}-${Math.random()}`,
        icon: 'ShieldCheck',
        title: 'NOVO ITEM',
        desc: 'Descrição do item.',
        color: '#D4A017',
      },
    ]);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIndex = prev.findIndex((it) => it.id === active.id);
      const newIndex = prev.findIndex((it) => it.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Não autenticado');
      // Strip ids before persisting (they're regenerated on load)
      const toSave = items.map(({ id, ...rest }) => rest);
      await Promise.all([
        upsertSetting('trust_bar_items', JSON.stringify(toSave), user.id),
        upsertSetting('trust_bar_bg', bgColor, user.id),
        upsertSetting('trust_bar_speed', String(speed), user.id),
      ]);
      toast({ title: 'Trust Bar salva!' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SettingsSkeleton />;

  return (
    <div className="space-y-6 w-full">
      <SettingsBackButton title="Trust Bar (Catálogo)" description="Edite os itens da barra de destaques abaixo do banner. Arraste para reordenar." />

      {/* Aparência */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" /> Aparência
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Cor de fundo</Label>
            <div className="flex items-center gap-2">
              <Input
                type="color"
                value={bgColor.startsWith('#') ? bgColor : '#f5f5f5'}
                onChange={(e) => setBgColor(e.target.value)}
                className="w-12 h-10 p-1 cursor-pointer shrink-0"
              />
              <Input
                type="text"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                placeholder="#f5f5f5 ou hsl(...) ou rgba(...)"
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => setBgColor(DEFAULT_TRUST_BAR_BG)}>
                Padrão
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Aceita hex, rgb/rgba ou hsl. Padrão usa o tom secundário do tema.</p>
          </div>
          <div className="space-y-2">
            <Label>Velocidade da animação: {speed}s por ciclo</Label>
            <Input
              type="range"
              min={5}
              max={120}
              step={1}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Rápido (5s)</span>
              <span>Lento (120s)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Live Preview */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" /> Preview ao vivo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border border-border/30 rounded-lg overflow-hidden" style={{ background: bgColor }}>
            <div className="py-3">
              <div
                className="flex animate-marquee whitespace-nowrap"
                style={{ animationDuration: `${speed}s` }}
              >
                {[...Array(2)].map((_, repeat) => (
                  <div key={repeat} className="flex items-center shrink-0">
                    <span className="text-border mx-4 md:mx-8 text-lg">|</span>
                    {items.map((item, i) => {
                      const Icon = TRUST_BAR_ICONS[item.icon] ?? ShieldCheck;
                      const iconColor = item.color || undefined;
                      return (
                        <div key={`${repeat}-${i}-${item.id}`} className="flex items-center shrink-0">
                          {i > 0 && <span className="text-border mx-4 md:mx-8 text-lg">|</span>}
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="bg-card rounded-lg p-2 shrink-0 shadow-sm">
                              <Icon
                                className={iconColor ? 'w-5 h-5' : 'w-5 h-5 text-primary'}
                                style={iconColor ? { color: iconColor } : undefined}
                              />
                            </div>
                            <div className="whitespace-nowrap">
                              <p className="text-xs font-bold text-foreground uppercase leading-tight">{item.title}</p>
                              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{item.desc}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">As alterações aparecem aqui em tempo real. Salve para publicar no catálogo.</p>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" /> Itens da Trust Bar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((it) => it.id!)} strategy={verticalListSortingStrategy}>
              <div className="space-y-4">
                {items.map((item, index) => (
                  <SortableItem
                    key={item.id}
                    item={item}
                    index={index}
                    onUpdate={updateItem}
                    onRemove={removeItem}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

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
