/**
 * Admin UI to reorder the credit-card fallback chain.
 * Persists a comma-separated list in `site_settings.card_fallback_order`.
 */
import { useEffect, useMemo, useState } from 'react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { GripVertical, Save, Shuffle, RotateCcw, Info, CheckCircle2, XCircle, HelpCircle } from 'lucide-react';

type Gateway = 'mercadopago' | 'pagarme' | 'asaas';
const ALLOWED: Gateway[] = ['mercadopago', 'pagarme', 'asaas'];
const DEFAULT_ORDER: Gateway[] = ['mercadopago', 'pagarme', 'asaas'];
const LABELS: Record<Gateway, string> = {
  mercadopago: 'Mercado Pago',
  pagarme: 'Pagar.me',
  asaas: 'Asaas',
};

const isTrue = (v: string | null | undefined) => v === null || v === undefined || v === '' || v === 'true';

type Flags = { enabled: boolean; fallback_enabled: boolean };

function SortableRow({ id, index, flags }: { id: Gateway; index: number; flags: Flags }) {
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
      <span className="font-medium text-sm flex-1">{LABELS[id]}</span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Por que este gateway aparece"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs space-y-1.5">
            <p className="text-xs font-medium">Visível porque está apto para fallback:</p>
            <div className="text-[11px] space-y-1">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-green-500" />
                <span>Gateway habilitado (<code>{id}_enabled</code>)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-green-500" />
                <span>Apto para fallback (<code>{id}_fallback_enabled</code>)</span>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </Card>
  );
}

const FallbackOrderConfig = () => {
  const { toast } = useToast();
  const [order, setOrder] = useState<Gateway[]>(DEFAULT_ORDER);
  const [initial, setInitial] = useState<Gateway[]>(DEFAULT_ORDER);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  // Per-gateway eligibility (must be both `_enabled` AND `_fallback_enabled`)
  const [flags, setFlags] = useState<Record<Gateway, Flags>>({
    mercadopago: { enabled: true, fallback_enabled: true },
    pagarme: { enabled: true, fallback_enabled: true },
    asaas: { enabled: true, fallback_enabled: true },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    loadAll();
    // Realtime: react when any toggle changes in another session
    const channel = supabase
      .channel('fallback-order-config')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_settings' }, (payload: any) => {
        const key = payload?.new?.key ?? payload?.old?.key;
        if (!key) return;
        if (key === 'card_fallback_order' || /^(asaas|mercadopago|pagarme)_(enabled|fallback_enabled)$/.test(key)) {
          loadAll();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAll = async () => {
    const [rawOrder, ...flags] = await Promise.all([
      fetchSetting('card_fallback_order'),
      ...ALLOWED.flatMap((g) => [fetchSetting(`${g}_enabled`), fetchSetting(`${g}_fallback_enabled`)]),
    ]);
    const next: Record<Gateway, Flags> = {
      mercadopago: { enabled: true, fallback_enabled: true },
      pagarme: { enabled: true, fallback_enabled: true },
      asaas: { enabled: true, fallback_enabled: true },
    };
    ALLOWED.forEach((g, idx) => {
      const enabled = isTrue(flags[idx * 2] as string | null);
      const fbEnabled = isTrue(flags[idx * 2 + 1] as string | null);
      next[g] = { enabled, fallback_enabled: fbEnabled };
    });
    setFlags(next);

    const parsed = (rawOrder || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s): s is Gateway => (ALLOWED as string[]).includes(s));
    for (const g of ALLOWED) if (!parsed.includes(g)) parsed.push(g);
    setOrder(parsed);
    setInitial(parsed);
    setLoaded(true);
  };

  // Order shown / interactable in the UI: only eligible gateways
  const visibleOrder = useMemo(() => order.filter((g) => eligibility[g]), [order, eligibility]);
  const hiddenGateways = useMemo(() => ALLOWED.filter((g) => !eligibility[g]), [eligibility]);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    // Reorder within the visible list, then merge back preserving hidden gateways at the end
    const visIds = visibleOrder;
    const oldIdx = visIds.indexOf(active.id as Gateway);
    const newIdx = visIds.indexOf(over.id as Gateway);
    if (oldIdx < 0 || newIdx < 0) return;
    const reorderedVisible = arrayMove(visIds, oldIdx, newIdx);
    const hidden = order.filter((g) => !eligibility[g]);
    setOrder([...reorderedVisible, ...hidden]);
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

      {visibleOrder.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
          <Info className="w-4 h-4" />
          Nenhum gateway está apto para fallback. Habilite "Apto para fallback de cartão" em pelo menos um gateway.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={visibleOrder} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {visibleOrder.map((g, i) => <SortableRow key={g} id={g} index={i} />)}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {hiddenGateways.length > 0 && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Info className="w-3 h-3" />
          Ocultos por estarem desabilitados: {hiddenGateways.map((g) => LABELS[g]).join(', ')}
        </p>
      )}

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