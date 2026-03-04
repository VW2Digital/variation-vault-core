import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useCart } from '@/contexts/CartContext';
import CheckoutForm from '@/components/CheckoutForm';
import { AnimatedSection } from '@/components/AnimatedSection';
import logoImg from '@/assets/liberty-pharma-logo.png';
import productHeroImg from '@/assets/product-hero.png';
import { ChevronLeft } from 'lucide-react';

const CartCheckout = () => {
  const navigate = useNavigate();
  const { items, totalPrice, clearCart } = useCart();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate(`/cliente/login?redirect=${encodeURIComponent('/checkout-carrinho')}`);
        return;
      }
    });
  }, [navigate]);

  if (items.length === 0) {
    navigate('/carrinho');
    return null;
  }

  // Build a combined product name and total for CheckoutForm
  const productName = items.map(i => `${i.product_name} ${i.dosage} x${i.quantity}`).join(', ');
  const totalQuantity = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/catalogo" className="flex items-center gap-2">
            <img src={logoImg} alt="Liberty Pharma" className="h-10 object-contain" />
          </Link>
          <Link
            to="/carrinho"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" /> Voltar ao carrinho
          </Link>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-4 py-8">
        <AnimatedSection variant="fadeUp">
          {/* Order Summary */}
          <div className="border border-border/50 rounded-xl p-5 bg-card mb-6">
            <h2 className="text-lg font-bold text-foreground mb-4">Resumo do Pedido</h2>
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.variation_id} className="flex items-center gap-4">
                  <img
                    src={item.image_url || productHeroImg}
                    alt={item.product_name}
                    className="w-14 h-14 object-contain rounded-lg border border-border/50 bg-muted p-1"
                  />
                  <div className="flex-1">
                    <p className="font-semibold text-foreground text-sm">{item.product_name}</p>
                    <p className="text-xs text-muted-foreground">{item.dosage} — Qtd: {item.quantity}</p>
                  </div>
                  <p className="font-bold text-primary text-sm">
                    R$ {(item.price * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              ))}
            </div>
            <div className="border-t border-border mt-4 pt-3 flex justify-between font-bold">
              <span className="text-foreground">Total</span>
              <span className="text-primary text-lg">
                R$ {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Checkout Form - uses total price as unit price with qty 1 */}
          <CheckoutForm
            productName={productName}
            dosage=""
            quantity={1}
            unitPrice={totalPrice}
          />
        </AnimatedSection>
      </section>
    </div>
  );
};

export default CartCheckout;
