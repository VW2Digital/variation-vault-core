import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '@/contexts/CartContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Minus, Plus, Trash2, ShoppingCart, ArrowLeft, Loader2 } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import productHeroImg from '@/assets/product-hero.png';

const CartPage = () => {
  const navigate = useNavigate();
  const { items, loading, updateQuantity, removeFromCart, totalItems, totalPrice } = useCart();

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
          <ShoppingCart className="w-6 h-6" /> Meu Carrinho
        </h1>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <Card className="border-border/50">
            <CardContent className="py-16 text-center space-y-4">
              <ShoppingCart className="w-16 h-16 text-muted-foreground/40 mx-auto" />
              <h3 className="text-lg font-semibold text-foreground">Carrinho vazio</h3>
              <p className="text-sm text-muted-foreground">Adicione produtos do catálogo ao seu carrinho.</p>
              <Link to="/catalogo">
                <Button className="mt-2">Ver Catálogo</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Items list */}
            <div className="lg:col-span-2 space-y-3">
              {items.map((item) => (
                <Card key={item.variation_id} className="border-border/50 overflow-hidden">
                  <CardContent className="p-4 flex items-center gap-4">
                    <img
                      src={item.image_url || productHeroImg}
                      alt={item.product_name}
                      className="w-20 h-20 object-contain rounded-lg border border-border/50 bg-muted p-1 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-foreground text-sm truncate">{item.product_name}</h3>
                      {item.dosage && !item.product_name.toLowerCase().includes(item.dosage.toLowerCase()) && (
                        <p className="text-xs text-muted-foreground">{item.dosage}</p>
                      )}
                      {item.is_offer && (
                        <p className="text-xs text-muted-foreground line-through">
                          R$ {item.original_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      )}
                      <p className={`font-bold mt-1 ${item.is_offer ? 'text-destructive' : 'text-primary'}`}>
                        R$ {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                      {!item.in_stock && (
                        <p className="text-xs text-destructive font-medium mt-1">Fora de estoque</p>
                      )}
                    </div>

                    {/* Quantity */}
                    {(() => {
                      const minQty = item.wholesale_prices.length > 0
                        ? Math.min(...item.wholesale_prices.map(t => t.min_quantity))
                        : 1;
                      return (
                        <div className="flex items-center gap-0 shrink-0">
                          <button
                            onClick={() => updateQuantity(item.variation_id, Math.max(minQty, item.quantity - 1))}
                            disabled={item.quantity <= minQty}
                            className="w-8 h-8 border border-border rounded-l-lg flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Minus className="w-3 h-3 text-foreground" />
                          </button>
                          <div className="w-10 h-8 border-y border-border flex items-center justify-center text-foreground font-medium text-sm">
                            {item.quantity}
                          </div>
                          <button
                            onClick={() => updateQuantity(item.variation_id, item.quantity + 1)}
                            className="w-8 h-8 border border-border rounded-r-lg flex items-center justify-center hover:bg-muted transition-colors"
                          >
                            <Plus className="w-3 h-3 text-foreground" />
                          </button>
                        </div>
                      );
                    })()}

                    {/* Subtotal + Remove */}
                    <div className="text-right shrink-0">
                      <p className="font-bold text-foreground text-sm">
                        R$ {(item.price * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                      <button
                        onClick={() => removeFromCart(item.variation_id)}
                        className="text-destructive hover:text-destructive/80 mt-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Summary */}
            <div>
              <Card className="border-border/50 sticky top-20">
                <CardContent className="p-5 space-y-4">
                  <h3 className="font-bold text-foreground">Resumo do Pedido</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{totalItems} {totalItems === 1 ? 'item' : 'itens'}</span>
                      <span className="text-foreground">
                        R$ {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                  <div className="border-t border-border pt-3 flex justify-between font-bold">
                    <span className="text-foreground">Total</span>
                    <span className="text-primary text-lg">
                      R$ {totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <Button
                    className="w-full h-12 text-base font-semibold"
                    disabled={items.length === 0 || items.some(i => !i.in_stock)}
                    onClick={() => navigate('/checkout-carrinho')}
                  >
                    Finalizar Compra
                  </Button>
                  {items.some(i => !i.in_stock) && (
                    <p className="text-xs text-destructive text-center">Remova itens fora de estoque para continuar</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default CartPage;
