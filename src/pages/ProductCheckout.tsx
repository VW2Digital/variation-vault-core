import { useState } from 'react';
import { useProducts } from '@/store';
import productHeroImg from '@/assets/product-hero.png';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Minus,
  Plus,
  CheckCircle2,
  ShieldCheck,
  Truck,
  Award,
  CalendarClock,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const ProductCheckout = () => {
  const { products } = useProducts();
  const product = products[0]; // Show first product

  const [selectedVariation, setSelectedVariation] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [currentImage, setCurrentImage] = useState(0);

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Nenhum produto disponível.</p>
      </div>
    );
  }

  const variation = product.variations[selectedVariation];
  const images = product.images.length > 0 ? product.images : [productHeroImg];

  const trustBadges = [
    { icon: ShieldCheck, title: 'Produto Certificado', desc: 'Aprovado por agências regulatórias' },
    { icon: Truck, title: 'Entrega Rápida', desc: 'Frete grátis para todo Brasil' },
    { icon: Award, title: 'Qualidade Premium', desc: 'Padrão internacional de qualidade' },
    { icon: CalendarClock, title: 'Uso Semanal', desc: 'Aplicação uma vez por semana' },
  ];

  const details = [
    { label: 'Princípio Ativo', value: product.activeIngredient },
    { label: 'Dosagem', value: variation?.dosage },
    { label: 'Forma Farmacêutica', value: product.pharmaForm },
    { label: 'Via de Administração', value: product.administrationRoute },
    { label: 'Frequência de Uso', value: product.frequency },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Top Banner */}
      <div className="bg-sidebar-background text-sidebar-foreground overflow-hidden">
        <div className="animate-marquee whitespace-nowrap py-2 text-xs font-medium tracking-wide">
          <span className="mx-8">🔥 PREÇO ESPECIAL PARA REVENDA — FALE COM A GENTE E SAIBA COMO TER ACESSO!</span>
          <span className="mx-8">🔥 PREÇO ESPECIAL PARA REVENDA — FALE COM A GENTE E SAIBA COMO TER ACESSO!</span>
          <span className="mx-8">🔥 PREÇO ESPECIAL PARA REVENDA — FALE COM A GENTE E SAIBA COMO TER ACESSO!</span>
        </div>
      </div>

      {/* Header */}
      <header className="border-b border-border/50 bg-card">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-primary tracking-tight">LIBERTY PHARMA</h2>
          <span className="text-sm text-muted-foreground">🌐 BR</span>
        </div>
      </header>

      {/* Product Section */}
      <section className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Image Gallery */}
          <div>
            <div className="relative bg-card rounded-xl border border-border/50 overflow-hidden aspect-square flex items-center justify-center">
              <img
                src={images[currentImage]}
                alt={product.name}
                className="max-w-[80%] max-h-[80%] object-contain"
              />
              {images.length > 1 && (
                <>
                  <button
                    onClick={() => setCurrentImage((p) => (p > 0 ? p - 1 : images.length - 1))}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-card/80 border border-border flex items-center justify-center hover:bg-card transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5 text-foreground" />
                  </button>
                  <button
                    onClick={() => setCurrentImage((p) => (p < images.length - 1 ? p + 1 : 0))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-card/80 border border-border flex items-center justify-center hover:bg-card transition-colors"
                  >
                    <ChevronRight className="w-5 h-5 text-foreground" />
                  </button>
                </>
              )}
            </div>
            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-2 mt-3">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentImage(i)}
                    className={`w-16 h-16 rounded-lg border-2 overflow-hidden transition-all ${
                      i === currentImage ? 'border-primary' : 'border-border/50 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-foreground">{product.name}</h1>
              <p className="text-muted-foreground mt-1">{product.subtitle}</p>
            </div>

            {/* Dosage Selector */}
            {product.variations.length > 1 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Selecione a Dosagem</p>
                <div className="flex gap-3">
                  {product.variations.map((v, i) => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVariation(i)}
                      className={`relative flex-1 p-4 rounded-lg border-2 transition-all text-left ${
                        i === selectedVariation
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/30'
                      }`}
                    >
                      {v.isOffer && (
                        <span className="absolute -top-2 right-2 bg-destructive text-destructive-foreground text-[10px] font-bold px-2 py-0.5 rounded">
                          OFERTA
                        </span>
                      )}
                      {i === selectedVariation && (
                        <CheckCircle2 className="absolute top-2 right-2 w-5 h-5 text-primary" />
                      )}
                      <p className="font-semibold text-foreground">{v.dosage}</p>
                      <p className="text-primary font-bold">R$ {v.price.toLocaleString('pt-BR')}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Info note */}
            <div className="bg-muted rounded-lg p-3 text-sm text-muted-foreground">
              Caneta de {variation?.dosage}: contém um total de 20mg, dividida em 4 doses de {variation?.dosage}.
            </div>

            {/* Quantity */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-primary">Quantidade</p>
              <div className="flex items-center gap-0">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-10 h-10 border border-border rounded-l-lg flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <Minus className="w-4 h-4 text-foreground" />
                </button>
                <div className="w-14 h-10 border-y border-border flex items-center justify-center text-foreground font-medium">
                  {quantity}
                </div>
                <button
                  onClick={() => setQuantity((q) => q + 1)}
                  className="w-10 h-10 border border-border rounded-r-lg flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <Plus className="w-4 h-4 text-foreground" />
                </button>
              </div>
            </div>

            {/* Price Box */}
            <div className="border border-border/50 rounded-xl p-5 space-y-3 bg-card">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Preço</p>
                {variation?.inStock ? (
                  <Badge className="bg-success/10 text-success border-success/20 hover:bg-success/10">Em estoque</Badge>
                ) : (
                  <Badge variant="destructive">Indisponível</Badge>
                )}
              </div>
              <p className="text-3xl font-bold text-primary">
                R$ {((variation?.price || 0) * quantity).toLocaleString('pt-BR')}
              </p>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>💳 Até 6x sem juros no cartão</p>
                <p className="text-success font-medium">◉ PIX disponível</p>
              </div>
            </div>

            {/* CTA */}
            <Button className="w-full h-14 text-lg font-semibold rounded-xl" disabled={!variation?.inStock}>
              Comprar Agora
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Pagamento seguro via Mercado Pago • Parcelamento em até 12x
            </p>

            {/* Trust Badges */}
            <div className="grid grid-cols-2 gap-3 pt-4">
              {trustBadges.map((badge) => (
                <div key={badge.title} className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-card">
                  <badge.icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{badge.title}</p>
                    <p className="text-xs text-muted-foreground">{badge.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Product Details Table */}
            <div className="border border-border/50 rounded-xl p-5 bg-card space-y-4">
              <h3 className="font-bold text-foreground">Detalhes do Produto</h3>
              <div className="divide-y divide-border/50">
                {details.map((d) => (
                  <div key={d.label} className="flex justify-between py-2.5 text-sm">
                    <span className="text-muted-foreground">{d.label}</span>
                    <span className="font-medium text-foreground">{d.value || '—'}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground pt-2">
                {product.description}
              </p>
              <p className="text-xs text-muted-foreground italic">
                * Este medicamento requer prescrição médica. Consulte um profissional de saúde antes do uso.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Bula Accordion */}
      <section className="max-w-6xl mx-auto px-4 pb-8">
        <Accordion type="single" collapsible>
          <AccordionItem value="bula" className="border border-border/50 rounded-xl px-5 bg-card">
            <AccordionTrigger className="text-lg font-bold text-foreground hover:no-underline">
              Bula do Medicamento
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-3 pb-5">
              <p>
                <strong>Indicação:</strong> Este medicamento é indicado para o tratamento de diabetes mellitus tipo 2 em adultos como adjuvante à dieta e exercícios para melhorar o controle glicêmico.
              </p>
              <p>
                <strong>Posologia:</strong> A dose inicial recomendada é de 2,5 mg uma vez por semana. Após 4 semanas, a dose deve ser aumentada para 5 mg uma vez por semana.
              </p>
              <p>
                <strong>Contraindicações:</strong> Hipersensibilidade ao princípio ativo ou a qualquer componente da formulação. Histórico pessoal ou familiar de carcinoma medular de tireoide.
              </p>
              <p>
                <strong>Precauções:</strong> Não utilizar em pacientes com diabetes tipo 1. Monitorar sinais de pancreatite. Pode causar hipoglicemia quando usado em combinação com insulina ou secretagogos de insulina.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

      {/* Testimonials */}
      <section className="max-w-6xl mx-auto px-4 pb-16 text-center">
        <h2 className="text-2xl font-bold text-foreground mb-2">Depoimentos de Clientes</h2>
        <p className="text-muted-foreground mb-8">
          Veja o que nossos clientes estão dizendo sobre o Liberty Pharma
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { name: 'Maria S.', text: 'Produto excelente! Resultado visível já na segunda semana de uso.' },
            { name: 'Carlos A.', text: 'Entrega rápida e produto de qualidade. Recomendo a todos.' },
            { name: 'Juliana R.', text: 'Melhor custo-benefício do mercado. Atendimento impecável.' },
          ].map((t) => (
            <div key={t.name} className="p-5 rounded-xl border border-border/50 bg-card text-left space-y-3">
              <div className="flex gap-1 text-primary">
                {'★★★★★'.split('').map((s, i) => (
                  <span key={i}>{s}</span>
                ))}
              </div>
              <p className="text-sm text-foreground">"{t.text}"</p>
              <p className="text-xs font-medium text-muted-foreground">— {t.name}</p>
            </div>
          ))}
        </div>
      </section>

      {/* WhatsApp FAB */}
      <a
        href="https://wa.me/5500000000000"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 w-14 h-14 bg-success rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform z-50"
      >
        <MessageCircle className="w-7 h-7 text-success-foreground" />
      </a>
    </div>
  );
};

export default ProductCheckout;
