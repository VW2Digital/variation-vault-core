import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { MessageCircle, Mail, Clock } from 'lucide-react';
import { fetchSetting } from '@/lib/api';
import WhatsAppIcon from '@/components/WhatsAppIcon';

const ContactPage = () => {
  const [whatsappNumber, setWhatsappNumber] = useState('');

  useEffect(() => {
    fetchSetting('whatsapp_number').then(setWhatsappNumber);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="flex items-center gap-3 mb-8">
          <MessageCircle className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Contato</h1>
        </div>

        <p className="text-muted-foreground mb-8">
          Estamos aqui para ajudar! Escolha o canal de sua preferência para entrar em contato conosco.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {whatsappNumber && /\d/.test(whatsappNumber) && (
            <a
              href={`https://wa.me/${whatsappNumber.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Card className="border-border/50 hover:border-success/50 hover:shadow-md transition-all h-full">
                <CardContent className="p-6 flex flex-col items-center text-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-[#25D366]/10 flex items-center justify-center">
                    <WhatsAppIcon className="w-7 h-7 text-[#25D366]" />
                  </div>
                  <h3 className="font-bold text-foreground">WhatsApp</h3>
                  <p className="text-sm text-muted-foreground">Atendimento rápido e direto pelo WhatsApp. Tire suas dúvidas em tempo real.</p>
                  <span className="text-sm font-medium text-success">Clique para conversar →</span>
                </CardContent>
              </Card>
            </a>
          )}

          <Card className="border-border/50 h-full">
            <CardContent className="p-6 flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <Mail className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-bold text-foreground">E-mail</h3>
              <p className="text-sm text-muted-foreground">Envie sua mensagem e responderemos o mais breve possível.</p>
              <span className="text-sm font-medium text-primary">contato@libertyelumina.com</span>
            </CardContent>
          </Card>

          <Card className="border-border/50 h-full sm:col-span-2">
            <CardContent className="p-6 flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <Clock className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-bold text-foreground">Horário de Atendimento</h3>
              <p className="text-sm text-muted-foreground">
                Segunda a Sexta: 8h às 18h<br />
                Sábado: 8h às 12h
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 p-4 bg-muted/50 rounded-xl border border-border/50 text-center">
          <p className="text-sm text-muted-foreground">
            Você também pode acessar o suporte diretamente na sua área de cliente em{' '}
            <a href="/minha-conta" className="text-primary font-medium hover:underline">Minha Conta</a>.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ContactPage;
