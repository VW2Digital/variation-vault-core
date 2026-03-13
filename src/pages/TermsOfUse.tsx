import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { FileText } from 'lucide-react';

const TermsOfUse = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="flex items-center gap-3 mb-8">
          <FileText className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Termos de Uso</h1>
        </div>

        <div className="prose prose-sm max-w-none space-y-6 text-muted-foreground">
          <p className="text-foreground font-medium">Última atualização: {new Date().toLocaleDateString('pt-BR')}</p>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">1. Aceitação dos termos</h2>
            <p>Ao acessar e utilizar este site, você concorda com estes Termos de Uso. Caso não concorde com qualquer parte destes termos, solicitamos que não utilize nossos serviços.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">2. Uso do serviço</h2>
            <p>Nosso serviço destina-se exclusivamente à venda de produtos farmacêuticos autorizados. Ao realizar uma compra, você declara que:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Possui mais de 18 anos de idade</li>
              <li>As informações fornecidas são verdadeiras e precisas</li>
              <li>Utilizará os produtos de acordo com as orientações médicas</li>
              <li>Não revenderá os produtos adquiridos sem a devida autorização</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">3. Cadastro e conta</h2>
            <p>Para realizar compras, é necessário criar uma conta fornecendo dados pessoais válidos. Você é responsável por manter a confidencialidade de suas credenciais de acesso e por todas as atividades realizadas em sua conta.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">4. Preços e pagamentos</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Os preços exibidos são em Reais (R$) e podem ser alterados sem aviso prévio</li>
              <li>Promoções e descontos por atacado têm validade limitada</li>
              <li>O pagamento pode ser realizado via PIX ou cartão de crédito</li>
              <li>O pedido será confirmado somente após a aprovação do pagamento</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">5. Entrega</h2>
            <p>Os prazos de entrega são estimados e podem variar conforme a região e disponibilidade da transportadora. Não nos responsabilizamos por atrasos causados por fatores externos como greves, desastres naturais ou problemas logísticos da transportadora.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">6. Trocas e devoluções</h2>
            <p>De acordo com o Código de Defesa do Consumidor, você pode solicitar a devolução do produto em até 7 dias corridos após o recebimento, desde que o produto esteja em sua embalagem original, lacrado e sem sinais de uso.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">7. Propriedade intelectual</h2>
            <p>Todo o conteúdo deste site, incluindo textos, imagens, logotipos e design, é de propriedade da Liberty Pharma e está protegido por leis de propriedade intelectual. É proibida a reprodução sem autorização prévia.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">8. Limitação de responsabilidade</h2>
            <p>A Liberty Pharma não se responsabiliza por danos indiretos decorrentes do uso inadequado dos produtos ou do não cumprimento das orientações médicas. Consulte sempre um profissional de saúde antes de utilizar qualquer medicamento.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">9. Alterações nos termos</h2>
            <p>Reservamo-nos o direito de alterar estes Termos de Uso a qualquer momento. As alterações entram em vigor imediatamente após a publicação nesta página.</p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default TermsOfUse;
