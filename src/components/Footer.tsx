import { Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEffect, useState } from 'react';
import { fetchSetting } from '@/lib/api';
import logoImg from '@/assets/liberty-pharma-logo.png';
import paymentMethodsImg from '@/assets/payment-methods.png';
import seloSiteProtegido from '@/assets/selo-site-protegido.png';
import seloSafeBrowsing from '@/assets/selo-safe-browsing.png';
import logoSedex from '@/assets/logo-sedex.png';
import logoPac from '@/assets/logo-pac.png';
import logoJadlog from '@/assets/logo-jadlog.png';
import logoJtExpress from '@/assets/logo-jt-express.png';
import { Shield, ShieldCheck } from 'lucide-react';

const Footer = () => {
  const { t } = useLanguage();
  const [footerText, setFooterText] = useState('');
  const [footerEmail, setFooterEmail] = useState('');
  const [footerPhone, setFooterPhone] = useState('');

  useEffect(() => {
    Promise.all([
      fetchSetting('footer_text'),
      fetchSetting('footer_email'),
      fetchSetting('footer_phone'),
    ]).then(([text, email, phone]) => {
      setFooterText(text || '');
      setFooterEmail(email || '');
      setFooterPhone(phone || '');
    });
  }, []);

  return (
    <footer className="border-t border-border/50 bg-card mt-12">
      <div className="max-w-7xl mx-auto px-4 py-10">
        {/* Main grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          {/* Column 1 - Company Info (hidden on mobile) */}
          <div className="hidden md:block space-y-3">
            <img src={logoImg} alt="Liberty Pharma" className="h-12 object-contain" />
            <div className="text-sm text-muted-foreground leading-relaxed space-y-2">
              {footerText && <p>{footerText}</p>}
              <p>
                Nossa missão é democratizar o acesso a insumos de última geração que auxiliam no controle metabólico, no manejo do diabetes tipo 2 e na perda de peso, oferecendo soluções avançadas com eficácia comprovada e qualidade farmacêutica para todos.
              </p>
              {footerEmail && <p>E-mail: {footerEmail}</p>}
              {footerPhone && <p>Tel: {footerPhone}</p>}
            </div>
          </div>

          {/* Column 2 - Payment Methods */}
          <div className="space-y-3">
            <h4 className="font-semibold text-primary md:text-foreground">Formas de Pagamento</h4>
            <img src={paymentMethodsImg} alt="Formas de pagamento: Visa, Mastercard, Maestro, Elo, Alelo, Amex, Banco do Brasil, Hipercard, Diners, Pix" className="w-full object-contain object-left" />
          </div>

          {/* Column 3 - Security Seals */}
          <div className="space-y-3">
            <h4 className="font-semibold text-primary md:text-foreground">Selos de Segurança</h4>
            <div className="flex flex-row md:flex-col items-start gap-3">
              <img src={seloSiteProtegido} alt="Compra Segura - Site Protegido - Certificado SSL" className="w-1/2 md:h-10 md:w-auto object-contain object-left" />
              <img src={seloSafeBrowsing} alt="Safe Browsing Google" className="w-1/2 md:h-10 md:w-auto object-contain object-left" />
            </div>
          </div>

          {/* Column 4 - Shipping Methods */}
          <div className="space-y-3">
            <h4 className="font-semibold text-primary md:text-foreground">Formas de Envio</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-2 flex items-center justify-start h-12">
                <img src={logoSedex} alt="SEDEX" className="max-h-10 w-auto object-contain" />
              </div>
              <div className="p-2 flex items-center justify-start h-12">
                <img src={logoPac} alt="PAC" className="max-h-10 w-auto object-contain" />
              </div>
              <div className="p-2 flex items-center justify-start h-12">
                <img src={logoJadlog} alt="Jadlog" className="max-h-10 w-auto object-contain" />
              </div>
              <div className="p-2 flex items-center justify-start h-12">
                <img src={logoJtExpress} alt="J&T Express" className="max-h-10 w-auto object-contain" />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-border/50 pt-6 flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Liberty Pharma — {t('allRights')}
          </p>
          <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
            <Link to="/politica-de-privacidade" className="text-muted-foreground hover:text-foreground transition-colors">
              Política de Privacidade
            </Link>
            <span className="text-border">|</span>
            <Link to="/termos-de-uso" className="text-muted-foreground hover:text-foreground transition-colors">
              Termos de Uso
            </Link>
            <span className="text-border">|</span>
            <Link to="/contato" className="text-muted-foreground hover:text-foreground transition-colors">
              Contato
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
