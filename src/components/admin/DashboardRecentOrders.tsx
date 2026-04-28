import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, CreditCard, QrCode, Clock, CheckCircle2, XCircle } from 'lucide-react';

interface RecentOrder {
  id: string;
  customer_name: string;
  product_name: string;
  total_value: number;
  payment_method: string;
  status: string;
  created_at: string;
}

interface Props {
  orders: RecentOrder[];
}

const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const CONFIRMED_STATUSES = ['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH', 'PAID'];
const FAILED_STATUSES = ['REFUSED', 'OVERDUE'];

function StatusIcon({ status }: { status: string }) {
  if (CONFIRMED_STATUSES.includes(status)) return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
  if (FAILED_STATUSES.includes(status)) return <XCircle className="w-3.5 h-3.5 text-rose-500" />;
  return <Clock className="w-3.5 h-3.5 text-amber-500" />;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

/**
 * Lista de pedidos recentes — inspirado no painel "Recent Transaction" da
 * referência. Mostra ícone do método, nome do cliente/produto e valor.
 */
export function DashboardRecentOrders({ orders }: Props) {
  const navigate = useNavigate();

  return (
    <Card className="border-border/40 shadow-sm h-full">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Pedidos Recentes
        </CardTitle>
        <button
          onClick={() => navigate('/admin/pedidos')}
          className="text-[11px] font-semibold text-primary hover:underline"
        >
          Ver todos
        </button>
      </CardHeader>
      <CardContent className="p-0">
        {orders.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-10 px-6">
            Nenhum pedido recente.
          </p>
        ) : (
          <ul className="divide-y divide-border/40">
            {orders.map((o) => {
              const isPix = o.payment_method === 'pix';
              return (
                <li
                  key={o.id}
                  onClick={() => navigate(`/admin/pedidos`)}
                  className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${
                    isPix ? 'bg-primary/10 text-primary' : 'bg-blue-500/10 text-blue-600'
                  }`}>
                    {isPix ? <QrCode className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {o.customer_name || 'Cliente'}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                      <StatusIcon status={o.status} />
                      <span className="truncate">{o.product_name}</span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-foreground whitespace-nowrap">
                      {formatBRL(Number(o.total_value || 0))}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{timeAgo(o.created_at)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
