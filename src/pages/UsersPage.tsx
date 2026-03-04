import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Loader2, Users, ShieldCheck, ShieldX, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface UserItem {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  full_name: string;
  phone: string;
  roles: string[];
}

const UsersPage = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await supabase.functions.invoke('admin-users', {
        method: 'GET',
      });

      if (res.error) throw new Error(res.error.message);
      setUsers(res.data || []);
    } catch (err: any) {
      toast({ title: 'Erro ao carregar usuários', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleRoleAction = async (userId: string, role: string, action: 'add_role' | 'remove_role') => {
    setActionLoading(userId);
    try {
      const res = await supabase.functions.invoke('admin-users', {
        method: 'POST',
        body: { action, userId, role },
      });
      if (res.error) throw new Error(res.error.message);
      toast({ title: action === 'add_role' ? 'Role adicionada!' : 'Role removida!' });
      await fetchUsers();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const filteredUsers = users.filter(u => {
    if (!search) return true;
    const term = search.toLowerCase();
    return u.email.toLowerCase().includes(term) || u.full_name.toLowerCase().includes(term);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Gerenciar Usuários</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Visualize e gerencie os usuários e suas permissões
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" onClick={fetchUsers} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Users className="w-4 h-4 mr-1" />}
          Atualizar
        </Button>
      </div>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-5 h-5" />
            {filteredUsers.length} {filteredUsers.length === 1 ? 'usuário' : 'usuários'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Último Acesso</TableHead>
                    <TableHead>Cadastro</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((u) => {
                    const isAdmin = u.roles.includes('admin');
                    return (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground text-sm">{u.full_name || 'Sem nome'}</p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {u.phone || '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {u.roles.length === 0 && (
                              <Badge variant="outline" className="text-xs">cliente</Badge>
                            )}
                            {u.roles.map(r => (
                              <Badge
                                key={r}
                                variant={r === 'admin' ? 'default' : 'secondary'}
                                className="text-xs flex items-center gap-1"
                              >
                                {r === 'admin' ? <ShieldCheck className="w-3 h-3" /> : null}
                                {r}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {u.last_sign_in_at
                            ? new Date(u.last_sign_in_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
                            : 'Nunca'
                          }
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(u.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </TableCell>
                        <TableCell className="text-right">
                          {isAdmin ? (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                                  disabled={actionLoading === u.id}
                                >
                                  {actionLoading === u.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <><ShieldX className="w-3 h-3 mr-1" /> Remover Admin</>
                                  )}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remover permissão de admin?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    O usuário <strong>{u.email}</strong> perderá acesso ao painel administrativo.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleRoleAction(u.id, 'admin', 'remove_role')}>
                                    Confirmar
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRoleAction(u.id, 'admin', 'add_role')}
                              disabled={actionLoading === u.id}
                            >
                              {actionLoading === u.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <><ShieldCheck className="w-3 h-3 mr-1" /> Tornar Admin</>
                              )}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UsersPage;
