import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Users, ArrowLeft, Download, Search, ChevronLeft, ChevronRight } from 'lucide-react';

interface Lead {
  id: string; name: string; email: string; phone: string | null;
  created_at: string; converted_order_id: string | null;
}

export default function FlashCampaignLeadsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [campaignTitle, setCampaignTitle] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 30;

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: c }, { data: ls }] = await Promise.all([
        supabase.from('flash_campaigns' as any).select('title').eq('id', id).maybeSingle(),
        supabase.from('flash_campaign_leads' as any).select('*').eq('campaign_id', id).order('created_at', { ascending: false }),
      ]);
      setCampaignTitle((c as any)?.title || '');
      setLeads((ls as any) || []);
      setLoading(false);
    })();
  }, [id]);

  const filtered = leads.filter(l => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return l.name.toLowerCase().includes(s) || l.email.toLowerCase().includes(s) || (l.phone || '').includes(s);
  });

  useEffect(() => { setPage(1); }, [q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const paginated = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const exportCsv = () => {
    const header = 'Nome,Email,WhatsApp,Data\n';
    const rows = filtered.map(l => `"${l.name}","${l.email}","${l.phone || ''}","${new Date(l.created_at).toLocaleString('pt-BR')}"`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `leads-${campaignTitle || id}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={Users}
        title={`Leads — ${campaignTitle}`}
        description={`${leads.length} lead(s) capturado(s)`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/admin/campanhas-relampago')}>
              <ArrowLeft className="w-4 h-4 mr-2" />Voltar
            </Button>
            <Button onClick={exportCsv} disabled={!filtered.length}>
              <Download className="w-4 h-4 mr-2" />Exportar CSV
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nome, email ou telefone" className="pl-9" />
          </div>
          {loading ? (
            <div className="text-sm text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Nenhum lead encontrado.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Comprou?</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map(l => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.name}</TableCell>
                    <TableCell>{l.email}</TableCell>
                    <TableCell>{l.phone || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString('pt-BR')}</TableCell>
                    <TableCell>{l.converted_order_id ? <span className="text-success font-medium">Sim</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!loading && filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="text-xs text-muted-foreground">
                Mostrando {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} de {filtered.length}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-xs">Página {currentPage} de {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
