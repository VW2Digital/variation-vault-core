import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, MessageCircle, Send, Plus, ArrowLeft, Clock, CheckCircle2, XCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  open: { label: 'Aberto', variant: 'default' },
  answered: { label: 'Respondido', variant: 'secondary' },
  closed: { label: 'Fechado', variant: 'outline' },
};

interface SupportChatProps {
  userId: string;
}

const SupportChat = ({ userId }: SupportChatProps) => {
  const { toast } = useToast();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newFirstMessage, setNewFirstMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchTickets();
  }, [userId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setTickets(data || []);
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
    setShowNewTicket(false);
  };

  const createTicket = async () => {
    if (!newSubject.trim() || !newFirstMessage.trim()) return;
    setCreating(true);
    try {
      const { data: ticket, error: ticketError } = await supabase
        .from('support_tickets')
        .insert({ user_id: userId, subject: newSubject.trim() })
        .select()
        .single();
      if (ticketError) throw ticketError;

      const { error: msgError } = await supabase
        .from('support_messages')
        .insert({ ticket_id: ticket.id, sender_id: userId, sender_role: 'user', message: newFirstMessage.trim() });
      if (msgError) throw msgError;

      toast({ title: 'Ticket criado com sucesso!' });
      setNewSubject('');
      setNewFirstMessage('');
      setShowNewTicket(false);
      await fetchTickets();
      openTicket(ticket);
    } catch (err: any) {
      toast({ title: 'Erro ao criar ticket', description: err.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedTicket) return;
    setSending(true);
    try {
      const { error } = await supabase
        .from('support_messages')
        .insert({ ticket_id: selectedTicket.id, sender_id: userId, sender_role: 'user', message: newMessage.trim() });
      if (error) throw error;

      // Update ticket status back to open if it was answered
      if (selectedTicket.status === 'answered') {
        await supabase.from('support_tickets').update({ status: 'open' }).eq('id', selectedTicket.id);
        setSelectedTicket({ ...selectedTicket, status: 'open' });
      }

      setNewMessage('');
      await fetchMessages(selectedTicket.id);
    } catch (err: any) {
      toast({ title: 'Erro ao enviar mensagem', description: err.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  // Ticket list view
  if (!selectedTicket && !showNewTicket) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Seus Tickets de Suporte</h3>
          <Button size="sm" onClick={() => setShowNewTicket(true)}>
            <Plus className="w-4 h-4 mr-1" /> Novo Ticket
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : tickets.length === 0 ? (
          <Card className="border-border/50">
            <CardContent className="py-12 text-center space-y-3">
              <MessageCircle className="w-12 h-12 text-muted-foreground/40 mx-auto" />
              <h3 className="text-base font-semibold text-foreground">Nenhum ticket aberto</h3>
              <p className="text-sm text-muted-foreground">Envie uma mensagem e nossa equipe responderá em breve.</p>
              <Button onClick={() => setShowNewTicket(true)}>
                <Plus className="w-4 h-4 mr-1" /> Criar Ticket
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {tickets.map((ticket) => {
              const status = statusMap[ticket.status] || statusMap.open;
              return (
                <Card
                  key={ticket.id}
                  className="border-border/50 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => openTicket(ticket)}
                >
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground text-sm truncate">{ticket.subject}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(ticket.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
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
  }

  // New ticket form
  if (showNewTicket) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setShowNewTicket(false)}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
        </Button>
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Novo Ticket de Suporte</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Assunto</label>
              <Input
                placeholder="Ex: Dúvida sobre meu pedido"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Mensagem</label>
              <Textarea
                placeholder="Descreva sua dúvida ou problema..."
                value={newFirstMessage}
                onChange={(e) => setNewFirstMessage(e.target.value)}
                rows={4}
              />
            </div>
            <Button onClick={createTicket} disabled={creating || !newSubject.trim() || !newFirstMessage.trim()}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
              Enviar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Chat view
  const ticketStatus = statusMap[selectedTicket.status] || statusMap.open;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => { setSelectedTicket(null); setMessages([]); }}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
        </Button>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground text-sm truncate">{selectedTicket.subject}</p>
        </div>
        <Badge variant={ticketStatus.variant}>{ticketStatus.label}</Badge>
      </div>

      <Card className="border-border/50">
        <CardContent className="p-0">
          {/* Messages */}
          <div className="h-[400px] overflow-y-auto p-4 space-y-3">
            {messagesLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-12">Nenhuma mensagem ainda.</p>
            ) : (
              messages.map((msg) => {
                const isUser = msg.sender_role === 'user';
                return (
                  <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-xl px-4 py-2.5 ${
                      isUser 
                        ? 'bg-primary text-primary-foreground rounded-br-sm' 
                        : 'bg-muted text-foreground rounded-bl-sm'
                    }`}>
                      {!isUser && (
                        <p className="text-xs font-semibold mb-1 opacity-70">Suporte</p>
                      )}
                      <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                      <p className={`text-[10px] mt-1 ${isUser ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                        {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          {selectedTicket.status !== 'closed' && (
            <div className="border-t border-border p-3 flex gap-2">
              <Input
                placeholder="Digite sua mensagem..."
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
};

export default SupportChat;
