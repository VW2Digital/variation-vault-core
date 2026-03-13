import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Shield } from 'lucide-react';

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="flex items-center gap-3 mb-8">
          <Shield className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Política de Privacidade</h1>
        </div>

        <div className="prose prose-sm max-w-none space-y-6 text-muted-foreground">
          <p className="text-foreground font-medium">Última atualização: {new Date().toLocaleDateString('pt-BR')}</p>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">1. Informações que coletamos</h2>
            <p>Coletamos as seguintes informações pessoais quando você utiliza nossos serviços:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Nome completo, CPF, e-mail e telefone (para cadastro e processamento de pedidos)</li>
              <li>Endereço de entrega (para envio dos produtos)</li>
              <li>Dados de pagamento (processados de forma segura por nosso parceiro de pagamentos)</li>
              <li>Histórico de pedidos e interações com o suporte</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">2. Como utilizamos suas informações</h2>
            <p>Utilizamos seus dados pessoais para:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Processar e entregar seus pedidos</li>
              <li>Enviar notificações sobre status de pedidos e rastreamento</li>
              <li>Fornecer suporte ao cliente</li>
              <li>Melhorar nossos serviços e experiência do usuário</li>
              <li>Cumprir obrigações legais e regulatórias</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">3. Compartilhamento de dados</h2>
            <p>Seus dados podem ser compartilhados com:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Processadores de pagamento para finalização de transações</li>
              <li>Transportadoras para envio e rastreamento de pedidos</li>
              <li>Autoridades competentes quando exigido por lei</li>
            </ul>
            <p>Não vendemos, alugamos ou compartilhamos suas informações pessoais com terceiros para fins de marketing.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">4. Segurança dos dados</h2>
            <p>Adotamos medidas técnicas e organizacionais para proteger seus dados pessoais contra acesso não autorizado, perda ou destruição, incluindo criptografia de dados sensíveis e controle de acesso restrito.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">5. Seus direitos (LGPD)</h2>
            <p>De acordo com a Lei Geral de Proteção de Dados (LGPD), você tem direito a:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Acessar seus dados pessoais</li>
              <li>Solicitar correção de dados incompletos ou desatualizados</li>
              <li>Solicitar a exclusão de seus dados</li>
              <li>Revogar o consentimento para o tratamento de dados</li>
              <li>Solicitar a portabilidade dos dados</li>
            </ul>
            <p>Para exercer seus direitos, entre em contato conosco através da nossa página de contato.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">6. Cookies</h2>
            <p>Utilizamos cookies essenciais para o funcionamento do site, como manutenção da sessão de login e itens do carrinho. Não utilizamos cookies de rastreamento de terceiros para publicidade.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">7. Alterações nesta política</h2>
            <p>Podemos atualizar esta Política de Privacidade periodicamente. Recomendamos que você revise esta página regularmente para se manter informado sobre como protegemos suas informações.</p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default PrivacyPolicy;
