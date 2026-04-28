import { Button } from '@/components/ui/button';
import { Bell, Plus, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useNavigate } from 'react-router-dom';

interface Props {
  adminName?: string;
}

/**
 * Header "Welcome Back" no estilo da referência: saudação grande,
 * busca global e botão "Criar Novo".
 */
export function DashboardWelcomeHeader({ adminName }: Props) {
  const navigate = useNavigate();
  const firstName = (adminName || 'Admin').split(' ')[0];

  return (
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      <div>
        <h1 className="text-2xl sm:text-3xl lg:text-[28px] font-black tracking-tight text-foreground">
          Bem-vindo de volta, {firstName}!
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          Aqui está um resumo da sua loja hoje.
        </p>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 w-full lg:w-auto">
        <div className="relative flex-1 lg:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar pedido, cliente, produto…"
            className="pl-9 rounded-full bg-muted/50 border-transparent focus:border-primary/40 h-10"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full bg-muted/60 hover:bg-muted h-10 w-10 shrink-0"
          aria-label="Notificações"
          onClick={() => navigate('/admin/falhas-pagamento')}
        >
          <Bell className="w-4 h-4" />
        </Button>
        <Button
          className="rounded-full h-10 px-4 sm:px-5 font-bold shrink-0 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
          onClick={() => navigate('/admin/produtos/novo')}
        >
          <Plus className="w-4 h-4 mr-1" /> Criar Novo
        </Button>
      </div>
    </div>
  );
}