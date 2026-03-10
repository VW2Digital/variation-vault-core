import { useState, useRef, useEffect } from 'react';
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AnimatedSection, StaggerContainer, StaggerItem } from '@/components/AnimatedSection';
import { fetchProduct, fetchTestimonials, fetchBanners, fetchSetting } from '@/lib/api';
import WhatsAppIcon from '@/components/WhatsAppIcon';
import { useCart } from '@/contexts/CartContext';
import Header from '@/components/Header';
import { useLanguage } from '@/contexts/LanguageContext';
import productHeroImg from '@/assets/product-hero.png';
import testimonial1 from '@/assets/testimonial-1.jpg';
import testimonial2 from '@/assets/testimonial-2.jpg';
import testimonial3 from '@/assets/testimonial-3.jpg';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger } from
'@/components/ui/accordion';
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
  CreditCard,
  CircleDollarSign,
  ShoppingCart } from
'lucide-react';

const VideoTestimonialCard = ({ thumbnail, name, videoUrl }: {thumbnail: string;name: string;videoUrl?: string;}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handlePlay = () => {
    if (videoUrl) {
      setIsPlaying(true);
      setTimeout(() => videoRef.current?.play(), 100);
    }
  };

  return (
    <div className="relative rounded-xl overflow-hidden border border-border/50 bg-foreground/5 aspect-[9/16] max-h-[420px]">
      {isPlaying && videoUrl ?
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full h-full object-cover"
        controls
        onEnded={() => setIsPlaying(false)} /> :


      <>
          <img
          src={thumbnail}
          alt={`Depoimento de ${name}`}
          className="w-full h-full object-cover" />
        
          <button
          onClick={handlePlay}
          className="absolute inset-0 flex items-center justify-center bg-foreground/20 hover:bg-foreground/30 transition-colors">
          
            <div className="w-14 h-14 rounded-full bg-card/90 flex items-center justify-center shadow-lg">
              <div className="w-0 h-0 border-t-[10px] border-t-transparent border-l-[16px] border-l-foreground border-b-[10px] border-b-transparent ml-1" />
            </div>
          </button>
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-foreground/80 to-transparent p-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-card text-xs">
                <span>▶</span>
                <span>0:00</span>
              </div>
              <div className="flex-1 h-1 bg-card/30 rounded-full overflow-hidden">
                <div className="h-full w-0 bg-destructive rounded-full" />
              </div>
              <span className="text-card text-xs">{name}</span>
            </div>
          </div>
        </>
      }
    </div>);

};

const ProductCheckout = () => {
  const { id } = useParams<{id: string;}>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { addToCart, totalItems } = useCart();
  const [searchParams] = useSearchParams();
  const [product, setProduct] = useState<any>(null);
  const [dynamicTestimonials, setDynamicTestimonials] = useState<any[]>([]);
  const [banners, setBanners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [selectedVariation, setSelectedVariation] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [currentImage, setCurrentImage] = useState(0);
  const [productReviews, setProductReviews] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    Promise.all([fetchProduct(id), fetchTestimonials(), fetchBanners(), fetchSetting('whatsapp_number')]).then(async ([prod, tests, bans, wp]) => {
      setProduct(prod);
      setDynamicTestimonials(tests);
      setBanners(bans);
      setWhatsappNumber(wp);
      const vId = searchParams.get('v');
      if (vId && prod.product_variations) {
        const idx = prod.product_variations.findIndex((v: any) => v.id === vId);
        if (idx >= 0) setSelectedVariation(idx);
      }
      // Fetch reviews for this product
      const { data: revData } = await supabase
        .from('reviews')
        .select('*')
        .eq('product_name', prod.name)
        .order('created_at', { ascending: false });
      setProductReviews(revData || []);
    }).finally(() => setLoading(false));
  }, [id, searchParams]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Carregando...</p>
      </div>);

  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Nenhum produto disponível.</p>
      </div>);

  }

  const variations = product.product_variations || [];
  const variation = variations[selectedVariation];

  // Build images: only from the selected variation
  const variationImages = variation?.images?.length > 0 ?
  variation.images :
  variation?.image_url ?
  [variation.image_url] :
  [];
  const images = variationImages.length > 0 ? variationImages : [productHeroImg];

  const trustBadges = [
  { icon: ShieldCheck, title: t('certifiedProduct'), desc: t('certifiedDesc') },
  { icon: Truck, title: t('fastDelivery'), desc: t('fastDeliveryDesc') },
  { icon: Award, title: t('premiumQuality'), desc: t('premiumQualityDesc') },
  { icon: CalendarClock, title: t('weeklyUse'), desc: t('weeklyUseDesc') }];


  const details = [
  { label: t('activeIngredientLabel'), value: product.active_ingredient },
  { label: t('dosageLabel'), value: variation?.dosage },
  { label: t('pharmaForm'), value: product.pharma_form },
  { label: t('adminRoute'), value: product.administration_route },
  { label: t('frequency'), value: product.frequency }];


  return (
    <div className="min-h-screen bg-background">
      {/* Top Banner */}
      {banners.length > 0 &&
      <div className="bg-black text-white overflow-hidden">
          <div className="animate-marquee whitespace-nowrap py-2 text-xs font-medium tracking-wide">
            {banners.map((b) =>
          <span key={b.id} className="mx-8">{b.text}</span>
          )}
            {banners.map((b) =>
          <span key={`dup-${b.id}`} className="mx-8">{b.text}</span>
          )}
          </div>
        </div>
      }

      <Header />

      {/* Product Section */}
      <section className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Image Gallery */}
          <AnimatedSection variant="fadeUp">
            <div className="relative bg-card rounded-xl border border-border/50 overflow-hidden aspect-square flex items-center justify-center">
              <img
                src={images[currentImage]}
                alt={product.name}
                className="max-w-[80%] max-h-[80%] object-contain" />
              
              {images.length > 1 &&
              <>
                  <button
                  onClick={() => setCurrentImage((p) => p > 0 ? p - 1 : images.length - 1)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-card/80 border border-border flex items-center justify-center hover:bg-card transition-colors">
                  
                    <ChevronLeft className="w-5 h-5 text-foreground" />
                  </button>
                  <button
                  onClick={() => setCurrentImage((p) => p < images.length - 1 ? p + 1 : 0)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-card/80 border border-border flex items-center justify-center hover:bg-card transition-colors">
                  
                    <ChevronRight className="w-5 h-5 text-foreground" />
                  </button>
                </>
              }
            </div>
            {/* Thumbnails */}
            {images.length > 1 &&
            <div className="flex gap-2 mt-3">
                {images.map((img, i) =>
              <button
                key={i}
                onClick={() => setCurrentImage(i)}
                className={`w-16 h-16 rounded-lg border-2 overflow-hidden transition-all ${
                i === currentImage ? 'border-primary' : 'border-border/50 opacity-60 hover:opacity-100'}`
                }>
                
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
              )}
              </div>
            }
          </AnimatedSection>

          {/* Product Info */}
          <AnimatedSection variant="fadeUp" delay={0.2} className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-foreground">{product.name}</h1>
              
            </div>

            {/* Dosage Selector */}
            {variations.length > 1 &&
            <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">{t('selectDosage')}</p>
                <div className="flex gap-3">
                  {variations.map((v: any, i: number) =>
                <button
                  key={v.id}
                  onClick={() => {setSelectedVariation(i);setCurrentImage(0);}}
                  className={`relative flex-1 p-4 rounded-lg border-2 transition-all text-left ${
                  i === selectedVariation ?
                  'border-primary bg-primary/5' :
                  'border-border hover:border-primary/30'}`
                  }>
                  
                      {v.is_offer &&
                  <span className="absolute -top-2 right-2 bg-destructive text-destructive-foreground text-[10px] font-bold px-2 py-0.5 rounded">
                          {t('offer')}
                        </span>
                  }
                      {i === selectedVariation &&
                  <CheckCircle2 className="absolute top-2 right-2 w-5 h-5 text-primary" />
                  }
                      {v.image_url

                  }
                      <p className="font-semibold text-foreground">{v.dosage}</p>
                      <p className="text-primary font-bold">R$ {Number(v.price).toLocaleString('pt-BR')}</p>
                    </button>
                )}
                </div>
              </div>
            }

            {/* Info note */}
            <div className="bg-muted rounded-lg p-3 text-sm text-muted-foreground">
              Caneta de {variation?.dosage}: contém um total de 20mg, dividida em 4 doses de {variation?.dosage}.
            </div>

            {/* Quantity */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-primary">{t('quantity')}</p>
              <div className="flex items-center gap-0">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-10 h-10 border border-border rounded-l-lg flex items-center justify-center hover:bg-muted transition-colors">
                  
                  <Minus className="w-4 h-4 text-foreground" />
                </button>
                <div className="w-14 h-10 border-y border-border flex items-center justify-center text-foreground font-medium">
                  {quantity}
                </div>
                <button
                  onClick={() => setQuantity((q) => q + 1)}
                  className="w-10 h-10 border border-border rounded-r-lg flex items-center justify-center hover:bg-muted transition-colors">
                  
                  <Plus className="w-4 h-4 text-foreground" />
                </button>
              </div>
            </div>

            {/* Price Box */}
            <div className="border border-border/50 rounded-xl p-5 space-y-3 bg-card">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{t('price')}</p>
                {variation?.in_stock ?
                <Badge className="bg-success/10 text-success border-success/20 hover:bg-success/10">{t('inStock')}</Badge> :

                <Badge variant="destructive">{t('unavailable')}</Badge>
                }
              </div>
              <p className="text-3xl font-bold text-primary">
                R$ {(Number(variation?.price || 0) * quantity).toLocaleString('pt-BR')}
              </p>
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="flex items-center gap-1"><CreditCard className="w-3.5 h-3.5" /> {t('upTo6x')}</p>
                <p className="text-success font-medium flex items-center gap-1"><CircleDollarSign className="w-3.5 h-3.5" /> {t('pixAvailable')}</p>
              </div>
            </div>

            {/* Buy Buttons */}
            {variation?.in_stock ?
            <div className="space-y-3">
                <Button
                className="w-full h-14 text-lg font-semibold rounded-xl"
                onClick={async () => {
                  const { data: { session } } = await supabase.auth.getSession();
                  const params = new URLSearchParams();
                  if (variation?.id) params.set('v', variation.id);
                  params.set('qty', String(quantity));
                  if (!session) {
                    navigate(`/cliente/login?redirect=${encodeURIComponent(`/checkout/${id}?${params.toString()}`)}`);
                    return;
                  }
                  navigate(`/checkout/${id}?${params.toString()}`);
                }}>
                
                  {t('buyNow')}
                </Button>
                <Button
                variant="outline"
                className="w-full h-12 text-base font-semibold rounded-xl"
                onClick={async () => {
                  const { data: { session } } = await supabase.auth.getSession();
                  if (!session) {
                    navigate(`/cliente/login?redirect=${encodeURIComponent(`/produto/${id}?v=${variation?.id}`)}`);
                    return;
                  }
                  if (variation?.id && id) {
                    addToCart(id, variation.id, quantity);
                  }
                }}>
                
                  <ShoppingCart className="w-5 h-5 mr-2" />
                  Adicionar ao Carrinho
                </Button>
              </div> :

            <Button className="w-full h-14 text-lg font-semibold rounded-xl" disabled>
                {t('soldOut')}
              </Button>
            }

          </AnimatedSection>
        </div>

        {/* Trust Badges - Full width */}
        <AnimatedSection variant="fadeUp" className="mt-8">
          <StaggerContainer className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {trustBadges.map((badge) =>
            <StaggerItem key={badge.title}>
                <div className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-card">
                  <badge.icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{badge.title}</p>
                    <p className="text-xs text-muted-foreground">{badge.desc}</p>
                  </div>
                </div>
              </StaggerItem>
            )}
          </StaggerContainer>
        </AnimatedSection>

        {/* Product Details Table - Full width */}
        <AnimatedSection variant="fadeUp" className="mt-6">
          <div className="border border-border/50 rounded-xl p-5 bg-card space-y-4">
            <h3 className="font-bold text-foreground">{t('productDetails')}</h3>
            <div className="divide-y divide-border/50">
              {details.map((d) =>
              <div key={d.label} className="flex justify-between py-2.5 text-sm">
                  <span className="text-muted-foreground">{d.label}</span>
                  <span className="font-medium text-foreground">{d.value || '—'}</span>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground pt-2">
              {product.description}
            </p>
            <p className="text-xs text-muted-foreground italic">
              {t('prescriptionNote')}
            </p>
          </div>
        </AnimatedSection>
      </section>

      {/* Bula Accordion */}
      <AnimatedSection className="max-w-6xl mx-auto px-4 pb-8">
        <Accordion type="single" collapsible>
          <AccordionItem value="bula" className="border border-border/50 rounded-xl px-5 bg-card">
            <AccordionTrigger className="text-lg font-bold text-foreground hover:no-underline">
              {t('drugBulletin')}
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-3 pb-5">
              <p><strong>Indicação:</strong> Este medicamento é indicado para o tratamento de diabetes mellitus tipo 2 em adultos como adjuvante à dieta e exercícios para melhorar o controle glicêmico.</p>
              <p><strong>Posologia:</strong> A dose inicial recomendada é de 2,5 mg uma vez por semana. Após 4 semanas, a dose deve ser aumentada para 5 mg uma vez por semana.</p>
              <p><strong>Contraindicações:</strong> Hipersensibilidade ao princípio ativo ou a qualquer componente da formulação. Histórico pessoal ou familiar de carcinoma medular de tireoide.</p>
              <p><strong>Precauções:</strong> Não utilizar em pacientes com diabetes tipo 1. Monitorar sinais de pancreatite. Pode causar hipoglicemia quando usado em combinação com insulina ou secretagogos de insulina.</p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </AnimatedSection>

      {/* Video Testimonials */}
      <AnimatedSection className="max-w-6xl mx-auto px-4 pb-8 text-center">
        <h2 className="text-2xl font-bold text-foreground mb-2">{t('customerTestimonials')}</h2>
        <p className="text-muted-foreground mb-8">
          {t('testimonialSubtitle')}
        </p>
        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {dynamicTestimonials.map((t) =>
          <StaggerItem key={t.id}>
              <VideoTestimonialCard thumbnail={t.thumbnail_url} name={t.name} videoUrl={t.video_url} />
            </StaggerItem>
          )}
          {dynamicTestimonials.length === 0 && [
          { img: testimonial1, name: 'Maria S.' },
          { img: testimonial2, name: 'Carlos A.' },
          { img: testimonial3, name: 'Juliana R.' }].
          map((t, idx) =>
          <StaggerItem key={idx}>
              <VideoTestimonialCard thumbnail={t.img} name={t.name} />
            </StaggerItem>
          )}
        </StaggerContainer>
      </AnimatedSection>

      {/* Text Testimonials */}
      <AnimatedSection className="max-w-6xl mx-auto px-4 pb-16">
        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
          { name: 'Maria S.', text: 'Produto excelente! Resultado visível já na segunda semana de uso.' },
          { name: 'Carlos A.', text: 'Entrega rápida e produto de qualidade. Recomendo a todos.' },
          { name: 'Juliana R.', text: 'Melhor custo-benefício do mercado. Atendimento impecável.' }].
          map((t) =>
          <StaggerItem key={t.name}>
              <div className="p-5 rounded-xl border border-border/50 bg-card text-left space-y-3">
                <div className="flex gap-1 text-primary">
                  {'★★★★★'.split('').map((s, i) =>
                <span key={i}>{s}</span>
                )}
                </div>
                <p className="text-sm text-foreground">"{t.text}"</p>
                <p className="text-xs font-medium text-muted-foreground">— {t.name}</p>
              </div>
            </StaggerItem>
          )}
        </StaggerContainer>
      </AnimatedSection>

      {/* WhatsApp FAB */}
      {whatsappNumber &&
      <a
        href={`https://wa.me/${whatsappNumber}`}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 w-14 h-14 bg-[#25D366] rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform z-50">
        
          <WhatsAppIcon className="w-7 h-7 text-white" />
        </a>
      }
    </div>);

};

export default ProductCheckout;