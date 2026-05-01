import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Shield } from 'lucide-react';
import { fetchSetting } from '@/lib/api';
import LegalContent from '@/components/LegalContent';

const DEFAULT_CONTENT = `<h2>1. Informações que coletamos</h2>
<p>Coletamos as seguintes informações pessoais quando você utiliza nossos serviços:</p>
<ul>
  <li>Nome completo, CPF, e-mail e telefone (para cadastro e processamento de pedidos)</li>
  <li>Endereço de entrega (para envio dos produtos)</li>
  <li>Dados de pagamento (processados de forma segura por nosso parceiro de pagamentos)</li>
  <li>Histórico de pedidos e interações com o suporte</li>
</ul>

<h2>2. Como utilizamos suas informações</h2>
<p>Utilizamos seus dados pessoais para processar pedidos, enviar notificações, prestar suporte e cumprir obrigações legais.</p>

<h2>3. Seus direitos (LGPD)</h2>
<p>Você pode acessar, corrigir, excluir ou portar seus dados a qualquer momento entrando em contato conosco.</p>`;

const PrivacyPolicy = () => {
  const [content, setContent] = useState<string | null>(null);

  useEffect(() => {
    fetchSetting('privacy_policy_content')
      .then((v) => setContent((v && v.trim()) || DEFAULT_CONTENT))
      .catch(() => setContent(DEFAULT_CONTENT));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="flex items-center gap-3 mb-8">
          <Shield className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Política de Privacidade</h1>
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

export default PrivacyPolicy;
