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

const SettingsTrustBar = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<TrustBarItem[]>(ensureIds(DEFAULT_TRUST_BAR));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    fetchSetting('trust_bar_items').then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) setItems(ensureIds(parsed));
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
      await upsertSetting('trust_bar_items', JSON.stringify(toSave), user.id);
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
      <SettingsBackButton title="Trust Bar (Catálogo)" description="Edite os itens da barra de destaques abaixo do banner. Arraste para reordenar." />

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
