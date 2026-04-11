import { Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEffect, useState } from 'react';
import { fetchSetting } from '@/lib/api';
import logoImg from '@/assets/liberty-pharma-logo.png';
import paymentMethodsImg from '@/assets/payment-methods.png';
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
          {/* Column 1 - Company Info */}
          <div className="space-y-3">
            <img src={logoImg} alt="Liberty Pharma" className="h-12 object-contain" />
            <div className="text-sm text-muted-foreground leading-relaxed">
              {footerText && <p>{footerText}</p>}
              {footerEmail && <p>E-mail: {footerEmail}</p>}
              {footerPhone && <p>Tel: {footerPhone}</p>}
            </div>
          </div>

          {/* Column 2 - Payment Methods */}
          <div className="space-y-3">
            <h4 className="font-semibold text-foreground">Formas de Pagamento</h4>
            <img src={paymentMethodsImg} alt="Formas de pagamento: Visa, Mastercard, Elo, Diners, American Express, Boleto Bancário e Pix" className="max-w-[220px]" />
          </div>

          {/* Column 3 - Security Seals */}
          <div className="space-y-3">
            <h4 className="font-semibold text-foreground">Selos de Segurança</h4>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-8 h-8 text-[hsl(var(--success))]" />
                <div>
                  <p className="text-xs font-bold text-[hsl(var(--success))] uppercase">Compra Segura</p>
                  <p className="text-[10px] text-muted-foreground">Site Protegido — Certificado SSL</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-8 h-8 text-[hsl(var(--success))]" />
                <div>
                  <p className="text-xs font-bold text-[hsl(var(--success))] uppercase">Safe Browsing</p>
                  <p className="text-[10px] text-muted-foreground">Navegação Segura Verificada</p>
                </div>
              </div>
            </div>
          </div>

          {/* Column 4 - Shipping Methods */}
          <div className="space-y-3">
            <h4 className="font-semibold text-foreground">Formas de Envio</h4>
            <div className="flex flex-wrap gap-2">
              <span className="bg-primary text-primary-foreground rounded px-3 py-1.5 text-sm font-bold tracking-wide">SEDEX</span>
              <span className="bg-primary text-primary-foreground rounded px-3 py-1.5 text-sm font-bold tracking-wide">PAC</span>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-border/50 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Liberty Pharma — {t('allRights')}
          </p>
          <nav className="flex items-center gap-4 text-sm">
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
