/**
 * Auditoria de alterações nos toggles dos gateways de pagamento.
 * Lê de `gateway_settings_audit` (apenas admins têm acesso via RLS).
 * Suporta filtros por gateway, tipo de alteração e intervalo de datas, com paginação server-side.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  History, RefreshCw, Power, Shuffle, ArrowRight,
  CalendarIcon, ChevronLeft, ChevronRight, X, Filter,
} from 'lucide-react';
import SettingsBackButton from '../SettingsBackButton';
import SettingsSkeleton from '@/components/admin/settings/SettingsSkeleton';

interface AuditEntry {
  id: string;
  user_email: string | null;
  gateway: string;
  setting_type: 'enabled' | 'fallback_enabled' | string;
  old_value: boolean | null;
  new_value: boolean;
  created_at: string;
}

const GATEWAY_LABEL: Record<string, string> = {
  asaas: 'Asaas',
  mercadopago: 'Mercado Pago',
  pagbank: 'PagBank',
  pagarme: 'Pagar.me',
  order: 'Ordem de fallback',
};

const SETTING_LABEL: Record<string, string> = {
  enabled: 'Gateway habilitado',
  fallback_enabled: 'Apto para fallback',
  fallback_order: 'Ordem do fallback',
};

const PAGE_SIZE = 25;
const GATEWAY_OPTIONS = ['asaas', 'mercadopago', 'pagbank', 'pagarme', 'order'] as const;
const SETTING_OPTIONS = ['enabled', 'fallback_enabled', 'fallback_order'] as const;

const GatewayAuditLog = () => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [gatewayFilter, setGatewayFilter] = useState<string>('all');
  const [settingFilter, setSettingFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  // Pagination
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('gateway_settings_audit' as any)
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (gatewayFilter !== 'all') query = query.eq('gateway', gatewayFilter);
    if (settingFilter !== 'all') query = query.eq('setting_type', settingFilter);
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      query = query.gte('created_at', from.toISOString());
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      query = query.lte('created_at', to.toISOString());
    }

    const fromIdx = page * PAGE_SIZE;
    const toIdx = fromIdx + PAGE_SIZE - 1;
    const { data, error, count } = await query.range(fromIdx, toIdx);
    if (!error && data) {
      setEntries(data as unknown as AuditEntry[]);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }, [gatewayFilter, settingFilter, dateFrom, dateTo, page]);

  // Reset to page 0 when filters change
  useEffect(() => { setPage(0); }, [gatewayFilter, settingFilter, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const hasActiveFilters = useMemo(
    () => gatewayFilter !== 'all' || settingFilter !== 'all' || !!dateFrom || !!dateTo,
    [gatewayFilter, settingFilter, dateFrom, dateTo],
  );

  const clearFilters = () => {
    setGatewayFilter('all');
    setSettingFilter('all');
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  return (
    <div className="space-y-6 w-full">
      <SettingsBackButton
        title="Auditoria de Gateways"
        description="Histórico de habilitação/desabilitação e alterações de fallback dos gateways de pagamento."
      />

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Filtros</h3>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 px-2 text-xs gap-1 ml-auto">
              <X className="w-3 h-3" /> Limpar
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Gateway</Label>
            <Select value={gatewayFilter} onValueChange={setGatewayFilter}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {GATEWAY_OPTIONS.map((g) => (
                  <SelectItem key={g} value={g}>{GATEWAY_LABEL[g] ?? g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tipo de alteração</Label>
            <Select value={settingFilter} onValueChange={setSettingFilter}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {SETTING_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{SETTING_LABEL[s] ?? s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">De</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'h-9 w-full justify-start text-left font-normal',
                    !dateFrom && 'text-muted-foreground',
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, 'dd/MM/yyyy', { locale: ptBR }) : <span>Selecionar</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateFrom}
                  onSelect={setDateFrom}
                  disabled={(d) => (dateTo ? d > dateTo : false) || d > new Date()}
                  initialFocus
                  className={cn('p-3 pointer-events-auto')}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Até</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'h-9 w-full justify-start text-left font-normal',
                    !dateTo && 'text-muted-foreground',
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateTo ? format(dateTo, 'dd/MM/yyyy', { locale: ptBR }) : <span>Selecionar</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateTo}
                  onSelect={setDateTo}
                  disabled={(d) => (dateFrom ? d < dateFrom : false) || d > new Date()}
                  initialFocus
                  className={cn('p-3 pointer-events-auto')}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {loading ? 'Carregando…' : `${totalCount} registro(s) encontrado(s)`}
        </p>
        <Button variant="outline" size="sm" onClick={load} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Atualizar
        </Button>
      </div>

      {loading ? (
        <SettingsSkeleton />
      ) : entries.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">
            {hasActiveFilters
              ? 'Nenhum registro encontrado com os filtros aplicados.'
              : 'Nenhuma alteração registrada ainda.'}
          </p>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {entries.map((e) => {
            const Icon = e.setting_type === 'fallback_enabled' ? Shuffle : Power;
            const isOn = e.new_value === true;
            return (
              <Card key={e.id} className="p-3 flex items-center gap-3 flex-wrap">
                <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap text-sm">
                    <span className="font-medium">{GATEWAY_LABEL[e.gateway] ?? e.gateway}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{SETTING_LABEL[e.setting_type] ?? e.setting_type}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <Badge variant="outline" className="h-5">{e.old_value === null ? '—' : e.old_value ? 'ON' : 'OFF'}</Badge>
                    <ArrowRight className="w-3 h-3" />
                    <Badge variant={isOn ? 'default' : 'destructive'} className="h-5">{isOn ? 'ON' : 'OFF'}</Badge>
                    <span className="ml-2">{e.user_email ?? 'usuário desconhecido'}</span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(e.created_at).toLocaleString('pt-BR')}
                </span>
              </Card>
            );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 pt-2">
              <p className="text-xs text-muted-foreground">
                Página {page + 1} de {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="gap-1"
                >
                  <ChevronLeft className="w-4 h-4" /> Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="gap-1"
                >
                  Próxima <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default GatewayAuditLog;