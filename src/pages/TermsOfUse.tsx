import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { FileText } from 'lucide-react';
import { fetchSetting } from '@/lib/api';
import LegalContent from '@/components/LegalContent';

const DEFAULT_CONTENT = `<h2>1. Aceitação dos termos</h2>
<p>Ao acessar e utilizar este site, você concorda com estes Termos de Uso. Caso não concorde com qualquer parte destes termos, solicitamos que não utilize nossos serviços.</p>

<h2>2. Uso do serviço</h2>
<p>Ao realizar uma compra, você declara que:</p>
<ul>
  <li>Possui mais de 18 anos de idade</li>
  <li>As informações fornecidas são verdadeiras e precisas</li>
  <li>Utilizará os produtos de acordo com as orientações aplicáveis</li>
</ul>

<h2>3. Preços e pagamentos</h2>
<p>Os preços exibidos são em Reais (R$) e podem ser alterados sem aviso prévio. O pedido será confirmado somente após a aprovação do pagamento.</p>

<h2>4. Entrega</h2>
<p>Os prazos de entrega são estimados e podem variar conforme a região e disponibilidade da transportadora.</p>

<h2>5. Trocas e devoluções</h2>
<p>De acordo com o Código de Defesa do Consumidor, você pode solicitar a devolução do produto em até 7 dias corridos após o recebimento.</p>`;

const TermsOfUse = () => {
  const [content, setContent] = useState<string | null>(null);

  useEffect(() => {
    fetchSetting('terms_of_use_content')
      .then((v) => setContent((v && v.trim()) || DEFAULT_CONTENT))
      .catch(() => setContent(DEFAULT_CONTENT));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="flex items-center gap-3 mb-8">
          <FileText className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Termos de Uso</h1>
        </div>
        <p className="text-foreground font-medium mb-6">
          Última atualização: {new Date().toLocaleDateString('pt-BR')}
        </p>
        {content === null ? (
          <div className="space-y-3">
            <div className="h-4 bg-muted rounded w-3/4 animate-pulse" />
            <div className="h-4 bg-muted rounded w-full animate-pulse" />
            <div className="h-4 bg-muted rounded w-5/6 animate-pulse" />
          </div>
        ) : (
          <LegalContent html={content} />
        )}
      </main>
      <Footer />
    </div>
  );
};

export default TermsOfUse;
