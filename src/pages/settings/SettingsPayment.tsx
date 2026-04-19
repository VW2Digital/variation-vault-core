import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchSetting } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { CreditCard, CheckCircle2 } from 'lucide-react';
import SettingsBackButton from './SettingsBackButton';
import AsaasSettings from './payment/AsaasSettings';
import MercadoPagoSettings from './payment/MercadoPagoSettings';
import PagBankSettings from './payment/PagBankSettings';
import PagarMeSettings from './payment/PagarMeSettings';
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
  const navigate = useNavigate();
  const { gateway } = useParams<{ gateway?: string }>();
  const [activeGateway, setActiveGateway] = useState<GatewayKey>('asaas');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSetting('payment_gateway').then((g) => {
      setActiveGateway((g as GatewayKey) || 'asaas');
    }).finally(() => setLoading(false));
  }, []);

  const selected = gateway && GATEWAYS.find((g) => g.key === gateway) ? (gateway as GatewayKey) : null;

  const closeSheet = () => navigate('/admin/configuracoes/pagamento');
  const openSheet = (key: GatewayKey) => navigate(`/admin/configuracoes/pagamento/${key}`);

  const renderSettings = (key: GatewayKey) => {
    const props = { isActive: activeGateway === key, onActivate: () => setActiveGateway(key) };
    switch (key) {
      case 'asaas': return <AsaasSettings {...props} />;
      case 'mercadopago': return <MercadoPagoSettings {...props} />;
      case 'pagbank': return <PagBankSettings {...props} />;
      case 'pagarme': return <PagarMeSettings {...props} />;
    }
  };

  if (loading) return <p className="text-muted-foreground">Carregando...</p>;

  const selectedMeta = selected ? GATEWAYS.find((g) => g.key === selected)! : null;

  return (
    <div className="space-y-6 w-full">
      <SettingsBackButton title="Gateways de Pagamento" description="Selecione um gateway para configurar. Apenas um pode estar ativo por vez." />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {GATEWAYS.map((gw) => {
          const isActive = activeGateway === gw.key;
          return (
            <button
              key={gw.key}
              type="button"
              onClick={() => openSheet(gw.key)}
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
                  <img
                    src={gw.logo}
                    alt={`Logo ${gw.name}`}
                    className="max-w-full max-h-full object-contain transition-transform duration-200 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <CreditCard className={`w-10 h-10 ${gw.brandClass}`} />
                    <span className="text-sm font-semibold text-foreground">{gw.name}</span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <Sheet open={!!selected} onOpenChange={(open) => { if (!open) closeSheet(); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedMeta && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle className="flex items-center gap-2">
                  {selectedMeta.logo ? (
                    <img src={selectedMeta.logo} alt="" className="w-6 h-6 rounded object-cover" />
                  ) : (
                    <CreditCard className={`w-5 h-5 ${selectedMeta.brandClass}`} />
                  )}
                  {selectedMeta.name}
                </SheetTitle>
                <SheetDescription>{selectedMeta.description}</SheetDescription>
              </SheetHeader>
              {renderSettings(selectedMeta.key)}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default SettingsPayment;
