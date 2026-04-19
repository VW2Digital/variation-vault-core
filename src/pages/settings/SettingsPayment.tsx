import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchSetting } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { CreditCard, CheckCircle2 } from 'lucide-react';
import SettingsBackButton from './SettingsBackButton';
import AsaasSettings from './payment/AsaasSettings';
import MercadoPagoSettings from './payment/MercadoPagoSettings';
import PagBankSettings from './payment/PagBankSettings';
import PagarMeSettings from './payment/PagarMeSettings';

type GatewayKey = 'asaas' | 'mercadopago' | 'pagbank' | 'pagarme';

const GATEWAYS: { key: GatewayKey; name: string; description: string; brandClass: string }[] = [
  { key: 'asaas', name: 'Asaas', description: 'Checkout transparente • PIX, cartão e boleto', brandClass: 'text-blue-600' },
  { key: 'mercadopago', name: 'Mercado Pago', description: 'Transparente ou Checkout Pro • PIX e cartão', brandClass: 'text-sky-500' },
  { key: 'pagbank', name: 'PagBank', description: 'Redirect • PIX e cartão', brandClass: 'text-orange-500' },
  { key: 'pagarme', name: 'Pagar.me', description: 'Transparente v5 • PIX e cartão tokenizado', brandClass: 'text-emerald-600' },
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {GATEWAYS.map((gw) => {
          const isActive = activeGateway === gw.key;
          return (
            <button
              key={gw.key}
              type="button"
              onClick={() => openSheet(gw.key)}
              className="text-left"
            >
              <Card className={`transition-all hover:shadow-md hover:border-primary/40 cursor-pointer ${isActive ? 'border-2 border-primary' : 'border-border/50'}`}>
                <CardContent className="p-5 flex items-start gap-4">
                  <div className={`shrink-0 w-12 h-12 rounded-lg bg-muted flex items-center justify-center ${gw.brandClass}`}>
                    <CreditCard className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-foreground">{gw.name}</h3>
                      {isActive && (
                        <Badge variant="default" className="gap-1 h-5 text-[10px]">
                          <CheckCircle2 className="w-3 h-3" /> Ativo
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{gw.description}</p>
                  </div>
                </CardContent>
              </Card>
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
                  <CreditCard className={`w-5 h-5 ${selectedMeta.brandClass}`} />
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
