import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Pencil, Ticket, Loader2, X, Check, Package } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Coupon {
  id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  max_uses: number;
  current_uses: number;
  active: boolean;
  created_at: string;
  product_id: string | null;
}

interface Product {
  id: string;
  name: string;
  subtitle: string | null;
  variations: { dosage: string; subtitle: string | null }[];
}

export default function CouponsPage() {
  const { toast } = useToast();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);

  // Form
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [maxUses, setMaxUses] = useState('1');
  const [productId, setProductId] = useState<string>('all');
  const [saving, setSaving] = useState(false);

  const fetchCoupons = async () => {
    const { data } = await supabase
      .from('coupons' as any)
      .select('*')
      .order('created_at', { ascending: false });
    setCoupons((data as any) || []);
    setLoading(false);
  };

  const fetchProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('id, name, subtitle, product_variations(dosage, subtitle)')
      .order('name');
    setProducts((data as any) || []);
  };

  useEffect(() => { fetchCoupons(); fetchProducts(); }, []);

  const resetForm = () => {
    setCode('');
    setDiscountType('percentage');
    setDiscountValue('');
    setMaxUses('1');
    setProductId('all');
    setEditing(null);
  };

  const openEdit = (c: Coupon) => {
    setEditing(c);
    setCode(c.code);
    setDiscountType(c.discount_type);
    setDiscountValue(String(c.discount_value));
    setMaxUses(String(c.max_uses));
    setProductId(c.product_id || 'all');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!code.trim() || !discountValue || Number(discountValue) <= 0 || Number(maxUses) < 1) {
      toast({ title: 'Preencha todos os campos corretamente.', variant: 'destructive' });
      return;
    }
    if (discountType === 'percentage' && Number(discountValue) > 100) {
      toast({ title: 'Desconto percentual não pode ser maior que 100%.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      const payload = {
        code: code.trim().toUpperCase(),
        discount_type: discountType,
        discount_value: Number(discountValue),
        max_uses: Number(maxUses),
        product_id: productId === 'all' ? null : productId,
        user_id: session.user.id,
      };

      if (editing) {
        const { error } = await supabase
          .from('coupons' as any)
          .update(payload)
          .eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Cupom atualizado!' });
      } else {
        const { error } = await supabase
          .from('coupons' as any)
          .insert(payload);
        if (error) {
          if (error.message?.includes('duplicate') || error.code === '23505') {
            toast({ title: 'Já existe um cupom com esse código.', variant: 'destructive' });
            setSaving(false);
            return;
          }
          throw error;
        }
        toast({ title: 'Cupom criado!' });
      }

      resetForm();
      setDialogOpen(false);
      fetchCoupons();
    } catch (err: any) {
      toast({ title: 'Erro ao salvar cupom', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c: Coupon) => {
    await supabase.from('coupons' as any).update({ active: !c.active }).eq('id', c.id);
    fetchCoupons();
  };

  const deleteCoupon = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este cupom?')) return;
    await supabase.from('coupons' as any).delete().eq('id', id);
    fetchCoupons();
    toast({ title: 'Cupom excluído.' });
  };

  const getProductLabel = (p: Product) => {
    const variations = p.variations || [];
    const varInfo = variations.map(v => v.subtitle || v.dosage).filter(Boolean);
    const suffix = varInfo.length > 0 ? ` (${varInfo.join(', ')})` : '';
    return `${p.name}${p.subtitle ? ` - ${p.subtitle}` : ''}${suffix}`;
  };

  const getProductName = (pid: string | null) => {
    if (!pid) return null;
    const p = products.find(pr => pr.id === pid);
    return p ? getProductLabel(p) : 'Produto removido';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cupons de Desconto</h1>
          <p className="text-sm text-muted-foreground">Gerencie cupons com limite de uso</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" /> Novo Cupom</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar Cupom' : 'Novo Cupom'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Código do cupom</Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                  placeholder="EX: DESCONTO10"
                  maxLength={30}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de desconto</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDiscountType('percentage')}
                    className={`p-3 rounded-lg border-2 text-center text-sm font-medium transition-all ${discountType === 'percentage' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'}`}
                  >
                    Porcentagem (%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountType('fixed')}
                    className={`p-3 rounded-lg border-2 text-center text-sm font-medium transition-all ${discountType === 'fixed' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'}`}
                  >
                    Valor Fixo (R$)
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{discountType === 'percentage' ? 'Desconto (%)' : 'Desconto (R$)'}</Label>
                <Input
                  type="number"
                  min="0"
                  max={discountType === 'percentage' ? '100' : undefined}
                  step="0.01"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={discountType === 'percentage' ? 'Ex: 10' : 'Ex: 25.00'}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Produto associado</Label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um produto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os produtos</SelectItem>
                    {products.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Deixe "Todos os produtos" para não restringir</p>
              </div>
              <div className="space-y-1.5">
                <Label>Limite de usos</Label>
                <Input
                  type="number"
                  min="1"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  placeholder="Ex: 100"
                />
                <p className="text-xs text-muted-foreground">Quantidade máxima de compras usando esse cupom</p>
              </div>
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {editing ? 'Salvar Alterações' : 'Criar Cupom'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : coupons.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <Ticket className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">Nenhum cupom cadastrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {coupons.map((c) => (
            <Card key={c.id} className={`transition-opacity ${!c.active ? 'opacity-60' : ''}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-mono tracking-wider">{c.code}</CardTitle>
                  <div className="flex items-center gap-1">
                    <Badge variant={c.active ? 'default' : 'secondary'} className="text-[10px]">
                      {c.active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Desconto</span>
                  <span className="font-bold text-foreground">
                    {c.discount_type === 'percentage'
                      ? `${c.discount_value}%`
                      : `R$ ${Number(c.discount_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                    }
                  </span>
                </div>
                {c.product_id && (
                  <div className="flex items-center gap-1.5 text-sm">
                    <Package className="w-3.5 h-3.5 text-primary" />
                    <span className="text-muted-foreground truncate">{getProductName(c.product_id)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Usos</span>
                  <span className="font-medium text-foreground">
                    {c.current_uses} / {c.max_uses}
                    {c.current_uses >= c.max_uses && (
                      <Badge variant="destructive" className="ml-2 text-[10px]">Esgotado</Badge>
                    )}
                  </span>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => toggleActive(c)}>
                    {c.active ? <X className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                    {c.active ? 'Desativar' : 'Ativar'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(c)}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => deleteCoupon(c.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
