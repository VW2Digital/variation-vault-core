import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart, getEffectivePrice } from '@/contexts/CartContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Minus, Plus, Trash2, ShoppingCart, ArrowLeft, Loader2, Pencil, Save, X, Ticket, Check } from 'lucide-react';
import { toast } from 'sonner';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import productHeroImg from '@/assets/product-hero.png';
import { supabase } from '@/integrations/supabase/client';

const APPLIED_COUPON_KEY = 'applied_coupon_code';

const CartPage = () => {
  const navigate = useNavigate();
  const { items, loading, updateQuantity, updateQuantitiesBulk, removeFromCart, totalItems, totalPrice } = useCart();

  // Bulk-edit mode: per-item draft quantities, kept in sync when items change
  const [bulkMode, setBulkMode] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  // Coupons
  const [availableCoupons, setAvailableCoupons] = useState<any[]>([]);
  const [loadingCoupons, setLoadingCoupons] = useState(false);
  const [couponsError, setCouponsError] = useState<string | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<any | null>(null);

  useEffect(() => {
    if (!bulkMode) return;
    setDrafts(prev => {
      const next: Record<string, number> = {};
      items.forEach(i => {
        next[i.variation_id] = prev[i.variation_id] ?? i.quantity;
      });
      return next;
    });
  }, [bulkMode, items]);

  // Load coupons valid for the current cart (universal OR restricted to a present product)
  useEffect(() => {
    if (items.length === 0) {
      setAvailableCoupons([]);
      setCouponsError(null);
      return;
    }
    const presentIds = new Set(items.map(i => i.product_id));
    let cancelled = false;
    const load = async () => {
      setLoadingCoupons(true);
      setCouponsError(null);
      try {
        const { data: coupons, error: couponsErr } = await supabase
          .from('coupons' as any)
          .select('*')
          .eq('active', true);
        if (couponsErr) throw couponsErr;
        const list = ((coupons as any[]) || []).filter(
          c => Number(c.current_uses || 0) < Number(c.max_uses || 0),
        );
        if (list.length === 0) {
          if (!cancelled) setAvailableCoupons([]);
          return;
        }
        const ids = list.map(c => c.id);
        const { data: links, error: linksErr } = await supabase
          .from('coupon_products' as any)
          .select('coupon_id, product_id')
          .in('coupon_id', ids);
        if (linksErr) throw linksErr;
        const linksByCoupon = new Map<string, string[]>();
        ((links as any[]) || []).forEach((l: any) => {
          const arr = linksByCoupon.get(l.coupon_id) || [];
          arr.push(l.product_id);
          linksByCoupon.set(l.coupon_id, arr);
        });
        const filtered = list.filter(c => {
          const restricted = linksByCoupon.get(c.id);
          if (!restricted || restricted.length === 0) return true;
          return restricted.some(rid => presentIds.has(rid));
        });
        if (!cancelled) setAvailableCoupons(filtered);
      } catch (err: any) {
        if (!cancelled) {
          setAvailableCoupons([]);
          setCouponsError(err?.message || 'Não foi possível carregar os cupons. Tente novamente.');
        }
      } finally {
        if (!cancelled) setLoadingCoupons(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [items]);

  // Restore applied coupon from sessionStorage when coupons load
  useEffect(() => {
    if (availableCoupons.length === 0) return;
    const saved = sessionStorage.getItem(APPLIED_COUPON_KEY);
    if (saved && !appliedCoupon) {
      const match = availableCoupons.find(c => c.code === saved);
      if (match) setAppliedCoupon(match);
    }
  }, [availableCoupons, appliedCoupon]);

  const handleApplyCoupon = (coupon: any) => {
    setAppliedCoupon(coupon);
    sessionStorage.setItem(APPLIED_COUPON_KEY, coupon.code);
    toast.success(`Cupom "${coupon.code}" aplicado!`);
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    sessionStorage.removeItem(APPLIED_COUPON_KEY);
  };

  // Live preview of subtotal/total using draft quantities + correct tier
  const previewTotal = useMemo(() => {
    if (!bulkMode) return totalPrice;
    return items.reduce((sum, i) => {
      const q = drafts[i.variation_id] ?? i.quantity;
      const basePrice = i.is_offer ? i.price : i.original_price;
      const unit = getEffectivePrice(basePrice, q, i.wholesale_prices);
      return sum + unit * q;
    }, 0);
  }, [bulkMode, drafts, items, totalPrice]);

  const couponDiscount = useMemo(() => {
    if (!appliedCoupon) return 0;
    if (appliedCoupon.discount_type === 'percentage') {
      return Math.round(previewTotal * (Number(appliedCoupon.discount_value) / 100) * 100) / 100;
    }
    return Math.min(Number(appliedCoupon.discount_value), previewTotal);
  }, [appliedCoupon, previewTotal]);

  const finalTotal = Math.max(0, previewTotal - couponDiscount);

  const previewItems = useMemo(() => {
    if (!bulkMode) return totalItems;
    return items.reduce((s, i) => s + (drafts[i.variation_id] ?? i.quantity), 0);
  }, [bulkMode, drafts, items, totalItems]);

  const hasChanges = useMemo(() => {
    if (!bulkMode) return false;
    return items.some(i => (drafts[i.variation_id] ?? i.quantity) !== i.quantity);
  }, [bulkMode, drafts, items]);

  const handleSaveBulk = async () => {
    setSaving(true);
    const updates = items.map(i => ({
      variationId: i.variation_id,
      quantity: drafts[i.variation_id] ?? i.quantity,
    }));
    const { adjusted } = await updateQuantitiesBulk(updates);
    setSaving(false);
    setBulkMode(false);
    if (adjusted.length === 0) {
      toast.success('Quantidades atualizadas');
    } else {
      toast.warning(
        `Quantidades atualizadas (${adjusted.length} item${adjusted.length > 1 ? 's' : ''} ajustado${adjusted.length > 1 ? 's' : ''} para o mínimo de atacado)`,
      );
    }
  };

  const handleCancelBulk = () => {
    setBulkMode(false);
    setDrafts({});
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShoppingCart className="w-6 h-6" /> Meu Carrinho
          </h1>
          {!loading && items.length > 1 && !bulkMode && (
            <Button variant="outline" size="sm" onClick={() => setBulkMode(true)}>
              <Pencil className="w-3.5 h-3.5 mr-1.5" /> Editar quantidades
            </Button>
          )}
          {bulkMode && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleCancelBulk} disabled={saving}>
                <X className="w-3.5 h-3.5 mr-1.5" /> Cancelar
              </Button>
              <Button size="sm" onClick={handleSaveBulk} disabled={saving || !hasChanges}>
                {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                Salvar alterações
              </Button>
            </div>
          )}
        </div>

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
                  <CardContent className="p-4">
                    {/* Top row: image + info */}
                    <div className="flex items-start gap-3">
                      <img
                        src={item.image_url || productHeroImg}
                        alt={item.product_name}
                        className="w-16 h-16 sm:w-20 sm:h-20 object-contain rounded-lg border border-border/50 bg-muted p-1 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-foreground text-sm leading-tight">{item.product_name}</h3>
                        {item.dosage && !item.product_name.toLowerCase().includes(item.dosage.toLowerCase()) && (
                          <p className="text-xs text-muted-foreground">{item.dosage}</p>
                        )}
                        {item.is_offer && (
                          <p className="text-xs text-muted-foreground line-through">
                            R$ {item.original_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                        )}
                        <p className={`font-bold text-sm mt-0.5 ${item.is_offer ? 'text-destructive' : 'text-primary'}`}>
                          R$ {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                        {!item.in_stock && (
                          <p className="text-xs text-destructive font-medium mt-1">Fora de estoque</p>
                        )}
                        {item.wholesale_prices.length > 0 && (() => {
                          // Sort tiers ascending and find active tier (highest min_quantity ≤ current qty)
                          const sorted = [...item.wholesale_prices].sort((a, b) => a.min_quantity - b.min_quantity);
                          const activeTier = [...sorted].reverse().find(t => item.quantity >= t.min_quantity);
                          const nextTier = sorted.find(t => t.min_quantity > item.quantity);
                          return (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {activeTier ? (
                                <Badge className="text-[10px] bg-success/15 text-success border border-success/30 hover:bg-success/15 font-semibold">
                                  Atacado {activeTier.min_quantity}+ ativo · R$ {activeTier.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/un.
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] border-primary/40 text-primary bg-primary/5 font-medium">
                                  Atacado a partir de {sorted[0].min_quantity} un.
                                </Badge>
                              )}
                              {nextTier && (
                                <Badge variant="outline" className="text-[10px] border-muted-foreground/30 text-muted-foreground font-medium">
                                  +{nextTier.min_quantity - item.quantity} un. → R$ {nextTier.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/un.
                                </Badge>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Bottom row: quantity + subtotal + remove */}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/30">
                       {(() => {
                         const minQty = 1;
                         if (bulkMode) {
                          const draftQty = drafts[item.variation_id] ?? item.quantity;
                          return (
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-muted-foreground">Qtd:</label>
                               <Input
                                 type="number"
                                 min={1}
                                value={draftQty}
                                onChange={(e) => {
                                  const v = parseInt(e.target.value, 10);
                                  setDrafts(prev => ({
                                    ...prev,
                                    [item.variation_id]: Number.isFinite(v) && v >= 1 ? v : 1,
                                  }));
                                }}
                                className="w-20 h-8 text-sm"
                              />
                            </div>
                          );
                        }
                        return (
                          <div className="flex items-center gap-0">
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

                      <div className="flex items-center gap-3">
                        {(() => {
                          // In bulk mode, preview the subtotal using the draft qty + correct tier
                          const q = bulkMode ? (drafts[item.variation_id] ?? item.quantity) : item.quantity;
                          const basePrice = item.is_offer ? item.price : item.original_price;
                          const unit = bulkMode
                            ? getEffectivePrice(basePrice, q, item.wholesale_prices)
                            : item.price;
                          const subtotal = unit * q;
                          const changed = bulkMode && q !== item.quantity;
                          return (
                            <p className={`font-bold text-sm ${changed ? 'text-primary' : 'text-foreground'}`}>
                              R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                          );
                        })()}
                        {!bulkMode && (
                          <button
                            onClick={() => removeFromCart(item.variation_id)}
                            className="text-destructive hover:text-destructive/80 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
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
                      <span className="text-muted-foreground">{previewItems} {previewItems === 1 ? 'item' : 'itens'}</span>
                      <span className="text-foreground">
                        R$ {previewTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    {appliedCoupon && couponDiscount > 0 && (
                      <div className="flex justify-between text-success">
                        <span>Cupom {appliedCoupon.code}</span>
                        <span>- R$ {couponDiscount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                  </div>

                  {/* Available coupons */}
                  <div className="border-t border-border pt-3 space-y-2">
                    <p className="text-xs font-semibold flex items-center gap-1 text-foreground">
                      <Ticket className="w-3.5 h-3.5" /> Cupons disponíveis
                    </p>
                    {loadingCoupons ? (
                      <p className="text-xs text-muted-foreground">Carregando...</p>
                    ) : availableCoupons.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nenhum cupom disponível.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {availableCoupons.map(c => {
                          const isApplied = appliedCoupon?.id === c.id;
                          const label = c.discount_type === 'percentage'
                            ? `${c.discount_value}% OFF`
                            : `R$ ${Number(c.discount_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} OFF`;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => isApplied ? handleRemoveCoupon() : handleApplyCoupon(c)}
                              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] border transition-colors ${
                                isApplied
                                  ? 'bg-success/10 border-success text-success'
                                  : 'border-dashed border-primary/40 hover:border-primary hover:bg-primary/5'
                              }`}
                            >
                              {isApplied ? <Check className="w-3 h-3" /> : <Ticket className="w-3 h-3 text-primary" />}
                              <span className="font-semibold">{c.code}</span>
                              <span className="text-muted-foreground">{label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-border pt-3 flex justify-between font-bold">
                    <span className="text-foreground">Total</span>
                    <span className="text-primary text-lg">
                      R$ {finalTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  {bulkMode && hasChanges && (
                    <p className="text-[11px] text-primary text-center">
                      Pré-visualização — clique em <strong>Salvar alterações</strong> para confirmar.
                    </p>
                  )}
                  <Button
                    className="w-full h-12 text-base font-semibold"
                    disabled={items.length === 0 || items.some(i => !i.in_stock) || bulkMode}
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
