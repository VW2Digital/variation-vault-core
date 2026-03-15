import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  RefreshCw, Users, Loader2, ShieldCheck, ShieldX, Search, Trash2,
  MoreVertical, Eye, Pencil, X, ChevronLeft, ChevronRight, CheckSquare, Save,
} from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface UserItem {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  full_name: string;
  phone: string;
  roles: string[];
}

const ITEMS_PER_PAGE = 15;

const UsersPage = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchDelete, setShowBatchDelete] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchUpdating, setBatchUpdating] = useState(false);

  // Dialogs
  const [viewUser, setViewUser] = useState<UserItem | null>(null);
  const [editUser, setEditUser] = useState<UserItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserItem | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', phone: '' });
  const [saving, setSaving] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await supabase.functions.invoke('admin-users', { method: 'GET' });
      if (res.error) throw new Error(res.error.message);
      setUsers(res.data || []);
    } catch (err: any) {
      toast({ title: 'Erro ao carregar usuários', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);
  useEffect(() => { setCurrentPage(1); }, [search]);

  // --- Actions ---
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

  const handleDeleteUser = async (userId: string) => {
    setActionLoading(userId);
    try {
      const res = await supabase.functions.invoke('admin-users', {
        method: 'POST',
        body: { action: 'delete_user', userId },
      });
      if (res.error) throw new Error(res.error.message);
      toast({ title: 'Conta excluída com sucesso!' });
      await fetchUsers();
    } catch (err: any) {
      toast({ title: 'Erro ao excluir conta', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const openEdit = (user: UserItem) => {
    setEditForm({ full_name: user.full_name || '', phone: user.phone || '' });
    setEditUser(user);
  };

  const saveEdit = async () => {
    if (!editUser) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: editForm.full_name, phone: editForm.phone })
        .eq('user_id', editUser.id);
      if (error) throw error;
      toast({ title: 'Usuário atualizado!' });
      setEditUser(null);
      fetchUsers();
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // --- Selection ---
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const pageIds = paginatedUsers.map(u => u.id);
    const allSelected = pageIds.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      pageIds.forEach(id => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  };

  const batchAddAdmin = async () => {
    if (selectedIds.size === 0) return;
    setBatchUpdating(true);
    try {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        await supabase.functions.invoke('admin-users', {
          method: 'POST',
          body: { action: 'add_role', userId: id, role: 'admin' },
        });
      }
      toast({ title: `${ids.length} usuário(s) tornados admin!` });
      setSelectedIds(new Set());
      fetchUsers();
    } catch (err: any) {
      toast({ title: 'Erro em lote', description: err.message, variant: 'destructive' });
    } finally {
      setBatchUpdating(false);
    }
  };

  const batchRemoveAdmin = async () => {
    if (selectedIds.size === 0) return;
    setBatchUpdating(true);
    try {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        await supabase.functions.invoke('admin-users', {
          method: 'POST',
          body: { action: 'remove_role', userId: id, role: 'admin' },
        });
      }
      toast({ title: `Admin removido de ${ids.length} usuário(s)!` });
      setSelectedIds(new Set());
      fetchUsers();
    } catch (err: any) {
      toast({ title: 'Erro em lote', description: err.message, variant: 'destructive' });
    } finally {
      setBatchUpdating(false);
    }
  };

  const batchDelete = async () => {
    if (selectedIds.size === 0) return;
    setBatchDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        await supabase.functions.invoke('admin-users', {
          method: 'POST',
          body: { action: 'delete_user', userId: id },
        });
      }
      toast({ title: `${ids.length} conta(s) excluída(s)!` });
      setSelectedIds(new Set());
      setShowBatchDelete(false);
      fetchUsers();
    } catch (err: any) {
      toast({ title: 'Erro ao excluir em lote', description: err.message, variant: 'destructive' });
    } finally {
      setBatchDeleting(false);
    }
  };

  // --- Filtering & Pagination ---
  const filteredUsers = users.filter(u => {
    if (!search) return true;
    const term = search.toLowerCase();
    return u.email.toLowerCase().includes(term) || u.full_name.toLowerCase().includes(term);
  });

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedUsers = filteredUsers.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  const InfoRow = ({ label, value }: { label: string; value: string | number | null | undefined }) => (
    <div className="flex justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground text-right max-w-[60%] break-words">{value || '-'}</span>
    </div>
  );

  return (
    <div className="space-y-6 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Gerenciar Usuários</h1>
        <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 sm:flex-none">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar nome ou email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 w-full sm:w-[250px]"
          />
        </div>
      </div>

      {/* Batch action bar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <span className="text-sm font-medium text-foreground">
            <CheckSquare className="inline h-4 w-4 mr-1" />
            {selectedIds.size} selecionado(s)
          </span>
          <Separator orientation="vertical" className="h-6" />
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={batchAddAdmin} disabled={batchUpdating}>
            <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Tornar Admin
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={batchRemoveAdmin} disabled={batchUpdating}>
            <ShieldX className="h-3.5 w-3.5 mr-1" /> Remover Admin
          </Button>
          <Button variant="destructive" size="sm" className="h-8 text-xs" onClick={() => setShowBatchDelete(true)} disabled={batchDeleting}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs ml-auto" onClick={() => setSelectedIds(new Set())}>
            <X className="h-3.5 w-3.5 mr-1" /> Limpar
          </Button>
          {batchUpdating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <Users className="w-12 h-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Nenhum usuário encontrado.</p>
        </div>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="space-y-3 md:hidden">
            {paginatedUsers.map((u) => {
              const isAdmin = u.roles.includes('admin');
              return (
                <Card key={u.id} className={`border-border/50 ${selectedIds.has(u.id) ? 'ring-1 ring-primary' : ''}`}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Checkbox checked={selectedIds.has(u.id)} onCheckedChange={() => toggleSelect(u.id)} />
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-foreground truncate">{u.full_name || 'Sem nome'}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewUser(u)}>
                            <Eye className="mr-2 h-4 w-4" /> Visualizar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(u)}>
                            <Pencil className="mr-2 h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          {isAdmin ? (
                            <DropdownMenuItem onClick={() => handleRoleAction(u.id, 'admin', 'remove_role')}>
                              <ShieldX className="mr-2 h-4 w-4" /> Remover Admin
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => handleRoleAction(u.id, 'admin', 'add_role')}>
                              <ShieldCheck className="mr-2 h-4 w-4" /> Tornar Admin
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(u)}>
                            <Trash2 className="mr-2 h-4 w-4" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{u.phone || 'Sem telefone'}</span>
                      <span>{new Date(u.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {u.roles.length === 0 && <Badge variant="outline" className="text-xs">cliente</Badge>}
                      {u.roles.map(r => (
                        <Badge key={r} variant={r === 'admin' ? 'default' : 'secondary'} className="text-xs flex items-center gap-1">
                          {r === 'admin' ? <ShieldCheck className="w-3 h-3" /> : null}{r}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Desktop table view */}
          <Card className="border-border/50 overflow-hidden hidden md:block">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={paginatedUsers.length > 0 && paginatedUsers.every(u => selectedIds.has(u.id))}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Último Acesso</TableHead>
                    <TableHead>Cadastro</TableHead>
                    <TableHead className="w-[60px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedUsers.map((u) => {
                    const isAdmin = u.roles.includes('admin');
                    return (
                      <TableRow key={u.id} className={selectedIds.has(u.id) ? 'bg-primary/5' : ''}>
                        <TableCell>
                          <Checkbox checked={selectedIds.has(u.id)} onCheckedChange={() => toggleSelect(u.id)} />
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground text-sm">{u.full_name || 'Sem nome'}</p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{u.phone || '-'}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {u.roles.length === 0 && <Badge variant="outline" className="text-xs">cliente</Badge>}
                            {u.roles.map(r => (
                              <Badge key={r} variant={r === 'admin' ? 'default' : 'secondary'} className="text-xs flex items-center gap-1">
                                {r === 'admin' ? <ShieldCheck className="w-3 h-3" /> : null}{r}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Nunca'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(u.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setViewUser(u)}>
                                <Eye className="mr-2 h-4 w-4" /> Visualizar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEdit(u)}>
                                <Pencil className="mr-2 h-4 w-4" /> Editar
                              </DropdownMenuItem>
                              {isAdmin ? (
                                <DropdownMenuItem onClick={() => handleRoleAction(u.id, 'admin', 'remove_role')}>
                                  <ShieldX className="mr-2 h-4 w-4" /> Remover Admin
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => handleRoleAction(u.id, 'admin', 'add_role')}>
                                  <ShieldCheck className="mr-2 h-4 w-4" /> Tornar Admin
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(u)}>
                                <Trash2 className="mr-2 h-4 w-4" /> Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
              <p className="text-xs sm:text-sm text-muted-foreground">
                Mostrando {((safePage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(safePage * ITEMS_PER_PAGE, filteredUsers.length)} de {filteredUsers.length} usuários
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={safePage <= 1} onClick={() => setCurrentPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                  .reduce<(number | string)[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    typeof p === 'string' ? (
                      <span key={`dots-${i}`} className="px-1 text-muted-foreground text-sm">…</span>
                    ) : (
                      <Button key={p} variant={p === safePage ? 'default' : 'outline'} size="icon" className="h-8 w-8 text-xs" onClick={() => setCurrentPage(p)}>
                        {p}
                      </Button>
                    )
                  )}
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={safePage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* View User Dialog */}
      <Dialog open={!!viewUser} onOpenChange={(open) => !open && setViewUser(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Usuário</DialogTitle>
          </DialogHeader>
          {viewUser && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-1">Informações</h4>
                <InfoRow label="Nome" value={viewUser.full_name || 'Sem nome'} />
                <InfoRow label="E-mail" value={viewUser.email} />
                <InfoRow label="Telefone" value={viewUser.phone} />
              </div>
              <Separator />
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-1">Permissões</h4>
                <div className="flex flex-wrap gap-1 mt-1">
                  {viewUser.roles.length === 0 && <Badge variant="outline">cliente</Badge>}
                  {viewUser.roles.map(r => (
                    <Badge key={r} variant={r === 'admin' ? 'default' : 'secondary'}>
                      {r === 'admin' ? <ShieldCheck className="w-3 h-3 mr-1" /> : null}{r}
                    </Badge>
                  ))}
                </div>
              </div>
              <Separator />
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-1">Datas</h4>
                <InfoRow label="Cadastro" value={new Date(viewUser.created_at).toLocaleString('pt-BR')} />
                <InfoRow label="Último acesso" value={viewUser.last_sign_in_at ? new Date(viewUser.last_sign_in_at).toLocaleString('pt-BR') : 'Nunca'} />
              </div>
              <Separator />
              <InfoRow label="ID" value={viewUser.id} />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">E-mail</Label>
              <Input value={editUser?.email || ''} disabled className="opacity-60" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nome Completo</Label>
              <Input value={editForm.full_name} onChange={(e) => setEditForm(f => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Telefone</Label>
              <Input value={editForm.phone} onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar conta permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              A conta de <strong>{deleteTarget?.email}</strong> será excluída permanentemente, incluindo todos os dados associados. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) handleDeleteUser(deleteTarget.id); setDeleteTarget(null); }}
            >
              Apagar Conta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch delete confirmation */}
      <AlertDialog open={showBatchDelete} onOpenChange={setShowBatchDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedIds.size} conta(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as contas selecionadas serão excluídas permanentemente, incluindo todos os dados associados. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={batchDelete}
              disabled={batchDeleting}
            >
              {batchDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Excluir {selectedIds.size} conta(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UsersPage;
