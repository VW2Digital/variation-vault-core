import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, MessageCircle, Send, ArrowLeft, XCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';

const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  open: { label: 'Aberto', variant: 'default' },
  answered: { label: 'Respondido', variant: 'secondary' },
  closed: { label: 'Fechado', variant: 'outline' },
};

const AdminSupportPage = () => {
  const { toast } = useToast();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [adminId, setAdminId] = useState<string>('');
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) setAdminId(session.user.id);
    };
    init();
    fetchTickets();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setTickets(data || []);

      // Fetch profile names for ticket users
      const userIds = [...new Set((data || []).map((t: any) => t.user_id))];
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', userIds);
        const map: Record<string, string> = {};
        (profilesData || []).forEach((p: any) => { map[p.user_id] = p.full_name; });
        setProfiles(map);
      }
    } catch (err: any) {
      toast({ title: 'Erro ao carregar tickets', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (ticketId: string) => {
    setMessagesLoading(true);
    try {
      const { data, error } = await supabase
        .from('support_messages')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setMessages(data || []);
    } catch (err: any) {
      toast({ title: 'Erro ao carregar mensagens', description: err.message, variant: 'destructive' });
    } finally {
      setMessagesLoading(false);
    }
  };

  const openTicket = (ticket: any) => {
    setSelectedTicket(ticket);
    fetchMessages(ticket.id);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedTicket || !adminId) return;
    setSending(true);
    try {
      const { error } = await supabase
        .from('support_messages')
        .insert({ ticket_id: selectedTicket.id, sender_id: adminId, sender_role: 'admin', message: newMessage.trim() });
      if (error) throw error;

      await supabase.from('support_tickets').update({ status: 'answered' }).eq('id', selectedTicket.id);
      setSelectedTicket({ ...selectedTicket, status: 'answered' });

      setNewMessage('');
      await fetchMessages(selectedTicket.id);
    } catch (err: any) {
      toast({ title: 'Erro ao enviar', description: err.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const closeTicket = async (ticketId: string) => {
    try {
      await supabase.from('support_tickets').update({ status: 'closed' }).eq('id', ticketId);
      setSelectedTicket((prev: any) => prev ? { ...prev, status: 'closed' } : prev);
      toast({ title: 'Ticket fechado' });
      fetchTickets();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  if (selectedTicket) {
    const ticketStatus = statusMap[selectedTicket.status] || statusMap.open;
    const userName = profiles[selectedTicket.user_id] || 'Usuário';

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => { setSelectedTicket(null); setMessages([]); fetchTickets(); }}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground text-sm truncate">{selectedTicket.subject}</p>
            <p className="text-xs text-muted-foreground">de {userName}</p>
          </div>
          <Badge variant={ticketStatus.variant}>{ticketStatus.label}</Badge>
          {selectedTicket.status !== 'closed' && (
            <Button variant="outline" size="sm" onClick={() => closeTicket(selectedTicket.id)}>
              <XCircle className="w-4 h-4 mr-1" /> Fechar
            </Button>
          )}
        </div>

        <Card className="border-border/50">
          <CardContent className="p-0">
            <div className="h-[500px] overflow-y-auto p-4 space-y-3">
              {messagesLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                messages.map((msg) => {
                  const isAdmin = msg.sender_role === 'admin';
                  return (
                    <div key={msg.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-xl px-4 py-2.5 ${
                        isAdmin
                          ? 'bg-primary text-primary-foreground rounded-br-sm'
                          : 'bg-muted text-foreground rounded-bl-sm'
                      }`}>
                        {!isAdmin && (
                          <p className="text-xs font-semibold mb-1 opacity-70">{userName}</p>
                        )}
                        {isAdmin && (
                          <p className="text-xs font-semibold mb-1 opacity-70">Você (Admin)</p>
                        )}
                        <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                        <p className={`text-[10px] mt-1 ${isAdmin ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                          {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {selectedTicket.status !== 'closed' && (
              <div className="border-t border-border p-3 flex gap-2">
                <Input
                  placeholder="Responder..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  disabled={sending}
                />
                <Button size="icon" onClick={sendMessage} disabled={sending || !newMessage.trim()}>
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Suporte"
        description="Gerencie os tickets de suporte dos clientes."
        icon={MessageCircle}
      />

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : tickets.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="py-12 text-center space-y-3">
            <MessageCircle className="w-12 h-12 text-muted-foreground/40 mx-auto" />
            <h3 className="text-base font-semibold text-foreground">Nenhum ticket de suporte</h3>
            <p className="text-sm text-muted-foreground">Os tickets dos clientes aparecerão aqui.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tickets.map((ticket) => {
            const status = statusMap[ticket.status] || statusMap.open;
            const userName = profiles[ticket.user_id] || 'Usuário';
            return (
              <Card
                key={ticket.id}
                className="border-border/50 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => openTicket(ticket)}
              >
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground text-sm truncate">{ticket.subject}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {userName} · {new Date(ticket.updated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminSupportPage;
