import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Loader2, ShieldCheck, User as UserIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface UserDetail {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  full_name: string;
  phone: string;
  roles: string[];
}

const InfoRow = ({ label, value }: { label: string; value: string | number | null | undefined }) => (
  <div className="flex justify-between gap-4 py-2 border-b border-border/40 last:border-0">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className="text-sm font-medium text-foreground text-right break-all">{value || '-'}</span>
  </div>
);

const UserDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await supabase.functions.invoke('admin-users', { method: 'GET' });
        if (res.error) throw new Error(res.error.message);
        const list: UserDetail[] = res.data || [];
        const found = list.find((u) => u.id === id) || null;
        setUser(found);
        if (!found) {
          toast({ title: 'Usuário não encontrado', variant: 'destructive' });
        }
      } catch (err: any) {
        toast({ title: 'Erro ao carregar usuário', description: err.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    if (id) load();
  }, [id, toast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/usuarios')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
        </Button>
        <p className="text-muted-foreground text-center py-12">Usuário não encontrado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-3xl">
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/admin/usuarios')}
          className="shrink-0 mt-0.5"
          aria-label="Voltar"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <UserIcon className="w-5 h-5 text-muted-foreground" />
            <span className="truncate">{user.full_name || 'Sem nome'}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1 truncate">{user.email}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informações</CardTitle>
        </CardHeader>
        <CardContent>
          <InfoRow label="Nome" value={user.full_name || 'Sem nome'} />
          <InfoRow label="E-mail" value={user.email} />
          <InfoRow label="Telefone" value={user.phone} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Permissões</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {user.roles.length === 0 && <Badge variant="outline">cliente</Badge>}
            {user.roles.map((r) => (
              <Badge key={r} variant={r === 'admin' ? 'default' : 'secondary'} className="flex items-center gap-1">
                {r === 'admin' ? <ShieldCheck className="w-3 h-3" /> : null}
                {r}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datas</CardTitle>
        </CardHeader>
        <CardContent>
          <InfoRow label="Cadastro" value={new Date(user.created_at).toLocaleString('pt-BR')} />
          <InfoRow
            label="Último acesso"
            value={user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('pt-BR') : 'Nunca'}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identificador</CardTitle>
        </CardHeader>
        <CardContent>
          <InfoRow label="ID" value={user.id} />
        </CardContent>
      </Card>
    </div>
  );
};

export default UserDetailPage;