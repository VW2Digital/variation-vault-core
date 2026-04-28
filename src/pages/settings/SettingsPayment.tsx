import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSetting } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { CreditCard, CheckCircle2, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SettingsBackButton from './SettingsBackButton';
import SettingsSkeleton from '@/components/admin/settings/SettingsSkeleton';
import asaasLogo from '@/assets/gateway-asaas.png';
import mercadoPagoLogo from '@/assets/gateway-mercadopago.png';
import pagarMeLogo from '@/assets/gateway-pagarme.png';
import pagBankLogo from '@/assets/gateway-pagbank.png';

type GatewayKey = 'asaas' | 'mercadopago' | 'pagbank' | 'pagarme';

const GATEWAYS: { key: GatewayKey; name: string; description: string; brandClass: string; logo?: string }[] = [
  { key: 'asaas', name: 'Asaas', description: 'Checkout transparente • PIX, cartão e boleto', brandClass: 'text-blue-600', logo: asaasLogo },
  { key: 'mercadopago', name: 'Mercado Pago', description: 'Transparente ou Checkout Pro • PIX e cartão', brandClass: 'text-sky-500', logo: mercadoPagoLogo },
  { key: 'pagbank', name: 'PagBank', description: 'Redirect • PIX e cartão', brandClass: 'text-orange-500', logo: pagBankLogo },
  { key: 'pagarme', name: 'Pagar.me', description: 'Transparente v5 • PIX e cartão tokenizado', brandClass: 'text-emerald-600', logo: pagarMeLogo },
];

const SettingsPayment = () => {
  const [activeGateway, setActiveGateway] = useState<GatewayKey>('asaas');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSetting('payment_gateway').then((g) => {
      setActiveGateway((g as GatewayKey) || 'asaas');
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <SettingsSkeleton />;

  return (
    <div className="space-y-6 w-full">
      <SettingsBackButton title="Gateways de Pagamento" description="Selecione um gateway para configurar. Apenas um pode estar ativo por vez." />

      <div className="flex justify-end">
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link to="/admin/configuracoes/pagamento/auditoria">
            <History className="w-4 h-4" /> Histórico de alterações
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {GATEWAYS.map((gw) => {
          const isActive = activeGateway === gw.key;
          return (
            <Link
              key={gw.key}
              to={`/admin/configuracoes/pagamento/${gw.key}`}
              className="group relative aspect-square rounded-xl bg-card border border-border/60 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden"
              aria-label={`Configurar ${gw.name}`}
            >
              {isActive && (
                <>
                  <Badge variant="default" className="absolute top-2 right-2 z-10 gap-1 h-5 text-[10px] shadow">
                    <CheckCircle2 className="w-3 h-3" /> Ativo
                  </Badge>
                  <span className="absolute inset-0 rounded-xl ring-2 ring-primary pointer-events-none" />
                </>
              )}
              <div className="absolute inset-0 flex items-center justify-center p-6">
                {gw.logo ? (
                  <div className="w-[60%] h-[60%] flex items-center justify-center">
                    <img
                      src={gw.logo}
                      alt={`Logo ${gw.name}`}
                      className="max-w-full max-h-full object-contain transition-transform duration-200 group-hover:scale-105"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <CreditCard className={`w-10 h-10 ${gw.brandClass}`} />
                    <span className="text-sm font-semibold text-foreground">{gw.name}</span>
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default SettingsPayment;
