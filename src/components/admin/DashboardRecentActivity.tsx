import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShoppingBag, MessageSquare, AlertTriangle, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface ActivityItem {
  id: string;
  type: 'order' | 'support' | 'failure' | 'signup';
  title: string;
  description: string;
  timeAgo: string;
  link?: string;
  cta?: { acceptLabel: string; declineLabel: string };
}

interface Props {
  items: ActivityItem[];
}

const ICONS: Record<ActivityItem['type'], any> = {
  order: ShoppingBag,
  support: MessageSquare,
  failure: AlertTriangle,
  signup: UserPlus,
};

const TONES: Record<ActivityItem['type'], string> = {
  order: 'bg-primary/10 text-primary',
  support: 'bg-sky-100 text-sky-700',
  failure: 'bg-rose-100 text-rose-700',
  signup: 'bg-emerald-100 text-emerald-700',
};

/**
 * "Recent Activity" — feed cronológico de eventos da loja
 * (pedidos, suporte, falhas, novos clientes).
 */
export function DashboardRecentActivity({ items }: Props) {
  const navigate = useNavigate();

  return (
    <Card className="border-border/40 shadow-sm h-full">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-foreground">Atividade Recente</h2>
        </div>

        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">Sem atividade recente.</p>
        ) : (
          <ul className="space-y-4">
            {items.slice(0, 4).map((item) => {
              const Icon = ICONS[item.type];
              return (
                <li key={item.id} className="flex items-start gap-3">
                  <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${TONES[item.type]}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-bold text-foreground truncate">{item.title}</p>
                      <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        {item.timeAgo}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{item.description}</p>
                    {item.cta && item.link && (
                      <div className="flex items-center gap-2 mt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 rounded-full text-[11px] px-3"
                        >
                          {item.cta.declineLabel}
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 rounded-full text-[11px] px-3 bg-primary hover:bg-primary/90"
                          onClick={() => item.link && navigate(item.link)}
                        >
                          {item.cta.acceptLabel}
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <Button
          variant="outline"
          className="w-full rounded-full mt-4 h-9 text-xs"
          onClick={() => navigate('/admin/pedidos')}
        >
          Ver tudo
        </Button>
      </CardContent>
    </Card>
  );
}