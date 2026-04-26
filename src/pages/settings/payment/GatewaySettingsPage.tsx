import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import { fetchSetting } from '@/lib/api';
import SettingsHeader from '@/components/admin/settings/SettingsHeader';
import SettingsSkeleton from '@/components/admin/settings/SettingsSkeleton';
import AsaasSettings from './AsaasSettings';
import MercadoPagoSettings from './MercadoPagoSettings';
import PagBankSettings from './PagBankSettings';
import PagarMeSettings from './PagarMeSettings';
import asaasLogo from '@/assets/gateway-asaas.png';
import mercadoPagoLogo from '@/assets/gateway-mercadopago.png';
import pagarMeLogo from '@/assets/gateway-pagarme.png';
import pagBankLogo from '@/assets/gateway-pagbank.png';

type GatewayKey = 'asaas' | 'mercadopago' | 'pagbank' | 'pagarme';

const GATEWAYS: Record<GatewayKey, {
  name: string;
  description: string;
  brandClass: string;
  logo?: string;
}> = {
  asaas: {
    name: 'Asaas',
    description: 'Checkout transparente • PIX, cartão e boleto',
    brandClass: 'text-blue-600',
    logo: asaasLogo,
  },
  mercadopago: {
    name: 'Mercado Pago',
    description: 'Transparente ou Checkout Pro • PIX e cartão',
    brandClass: 'text-sky-500',
    logo: mercadoPagoLogo,
  },
  pagbank: {
    name: 'PagBank',
    description: 'Redirect • PIX e cartão',
    brandClass: 'text-orange-500',
    logo: pagBankLogo,
  },
  pagarme: {
    name: 'Pagar.me',
    description: 'Transparente v5 • PIX e cartão tokenizado',
    brandClass: 'text-emerald-600',
    logo: pagarMeLogo,
  },
};

const isGatewayKey = (v: string | undefined): v is GatewayKey =>
  !!v && ['asaas', 'mercadopago', 'pagbank', 'pagarme'].includes(v);

const GatewaySettingsPage = () => {
  const { gateway } = useParams<{ gateway?: string }>();
  const navigate = useNavigate();
  const [activeGateway, setActiveGateway] = useState<GatewayKey>('asaas');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSetting('payment_gateway')
      .then((g) => setActiveGateway((g as GatewayKey) || 'asaas'))
      .finally(() => setLoading(false));
  }, []);

  // Invalid gateway slug → redirect to gateway list.
  useEffect(() => {
    if (gateway && !isGatewayKey(gateway)) {
      navigate('/admin/configuracoes/pagamento', { replace: true });
    }
  }, [gateway, navigate]);

  if (loading || !isGatewayKey(gateway)) return <SettingsSkeleton />;

  const meta = GATEWAYS[gateway];
  const props = {
    isActive: activeGateway === gateway,
    onActivate: () => setActiveGateway(gateway),
  };

  const renderSettings = () => {
    switch (gateway) {
      case 'asaas': return <AsaasSettings {...props} />;
      case 'mercadopago': return <MercadoPagoSettings {...props} />;
      case 'pagbank': return <PagBankSettings {...props} />;
      case 'pagarme': return <PagarMeSettings {...props} />;
    }
  };

  return (
    <div className="space-y-6 w-full">
      <SettingsHeader
        title={meta.name}
        description={meta.description}
        action="back"
        backTo="/admin/configuracoes/pagamento"
        icon={
          meta.logo ? (
            <img src={meta.logo} alt="" className="w-6 h-6 rounded object-cover" />
          ) : (
            <CreditCard className={`w-5 h-5 ${meta.brandClass}`} />
          )
        }
      />
      {renderSettings()}
    </div>
  );
};

export default GatewaySettingsPage;