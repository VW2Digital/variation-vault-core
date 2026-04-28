/**
 * Admin UI to reorder the credit-card fallback chain.
 * Persists a comma-separated list in `site_settings.card_fallback_order`.
 */
import { useEffect, useState } from 'react';
import { fetchSetting, upsertSetting, getCurrentUser } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { GripVertical, Save, Shuffle, RotateCcw } from 'lucide-react';

type Gateway = 'mercadopago' | 'pagarme' | 'asaas';
const ALLOWED: Gateway[] = ['mercadopago', 'pagarme', 'asaas'];
const DEFAULT_ORDER: Gateway[] = ['mercadopago', 'pagarme', 'asaas'];
const LABELS: Record<Gateway, string> = {
  mercadopago: 'Mercado Pago',
  pagarme: 'Pagar.me',
  asaas: 'Asaas',
};

function SortableRow({ id, index }: { id: Gateway; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <Card
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      className="p-3 flex items-center gap-3 cursor-grab active:cursor-grabbing select-none"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="w-4 h-4 text-muted-foreground" />
      <Badge variant="outline" className="h-5 w-6 justify-center">{index + 1}</Badge>
      <span className="font-medium text-sm">{LABELS[id]}</span>
    </Card>
  );
}

const FallbackOrderConfig = () => {
  const { toast } = useToast();
  const [order, setOrder] = useState<Gateway[]>(DEFAULT_ORDER);
  const [initial, setInitial] = useState<Gateway[]>(DEFAULT_ORDER);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    fetchSetting('card_fallback_order').then((raw) => {
      const parsed = (raw || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s): s is Gateway => (ALLOWED as string[]).includes(s));
      for (const g of ALLOWED) if (!parsed.includes(g)) parsed.push(g);
      setOrder(parsed);
      setInitial(parsed);
      setLoaded(true);
    });
  }, []);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(active.id as Gateway);
    const newIndex = order.indexOf(over.id as Gateway);
    setOrder(arrayMove(order, oldIndex, newIndex));
  };

  const dirty = order.join(',') !== initial.join(',');

  const handleSave = async () => {
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Não autenticado');
      const value = order.join(',');
      await upsertSetting('card_fallback_order', value, user.id);
      // Audit (non-blocking)
      try {
        await supabase.from('gateway_settings_audit' as any).insert({
          user_id: user.id,
          user_email: user.email ?? null,
          gateway: 'order',
          setting_type: 'fallback_order',
          old_value: null,
          new_value: true,
        });
      } catch { /* noop */ }
      setInitial(order);
      toast({ title: 'Ordem de fallback salva' });
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => setOrder(DEFAULT_ORDER);

  if (!loaded) return null;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Shuffle className="w-4 h-4 mt-0.5 text-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">Ordem do fallback de cartão</h3>
          <p className="text-xs text-muted-foreground">
            Quando um cartão for recusado, sugerimos os processadores abaixo nesta ordem.
            Arraste para reordenar. PagBank é excluído por usar redirect.
          </p>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {order.map((g, i) => <SortableRow key={g} id={g} index={i} />)}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={handleReset} className="gap-2">
          <RotateCcw className="w-4 h-4" /> Padrão
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!dirty || saving} className="gap-2">
          <Save className="w-4 h-4" /> Salvar ordem
        </Button>
      </div>
    </Card>
  );
};

export default FallbackOrderConfig;