import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Boxes,
  Plus,
  Trash2,
  Save,
  Loader2,
  ImagePlus,
  ArrowLeft,
  Copy as CopyIcon,
  Pencil,
  GripVertical,
  TrendingDown,
  Wand2,
  AlertCircle,
  ChevronsUpDown,
  Check,
  Search,
} from 'lucide-react';

interface Variation { id: string; dosage: string; in_stock: boolean; price: number; offer_price: number; is_offer: boolean; }
interface Product { id: string; name: string; active: boolean; variations: Variation[]; }
interface ComboItemRow {
  id: string;
  product_id: string;
  variation_id: string | null;
  quantity: number;
  sort_order: number;
}
interface Combo {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  slug: string;
  image_url: string;
  price: number;
  compare_price: number;
  active: boolean;
  sort_order: number;
  max_installments: number;
  pix_discount_percent: number;
  items_count?: number;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);

const fmtBRL = (n: number) =>
  Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

function usePersistedState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return initial;
    try {
      const raw = window.localStorage.getItem(key);
      return raw != null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [key, state]);
  return [state, setState];
}

type ProductFilterStatus = 'all' | 'active' | 'inactive';

function ProductPicker({
  products,
  value,
  onChange,
}: {
  products: Product[];
  value: string;
  onChange: (productId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = usePersistedState<ProductFilterStatus>(
    'combos:picker:product:status',
    'active',
  );
  const [onlyWithStock, setOnlyWithStock] = usePersistedState<boolean>(
    'combos:picker:product:onlyWithStock',
    false,
  );
  const [search, setSearch] = usePersistedState<string>('combos:picker:product:search', '');
  const selected = products.find((p) => p.id === value);

  const filtered = products.filter((p) => {
    if (status === 'active' && !p.active) return false;
    if (status === 'inactive' && p.active) return false;
    if (onlyWithStock && !p.variations.some((v) => v.in_stock)) return false;
    return true;
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {selected
              ? `${selected.name}${!selected.active ? ' (inativo)' : ''}`
              : 'Selecione um produto...'}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Buscar produto por nome..."
            value={search}
            onValueChange={setSearch}
          />
          <div className="flex items-center gap-1 px-2 py-1.5 border-b">
            {(['active', 'all', 'inactive'] as ProductFilterStatus[]).map((s) => (
              <Button
                key={s}
                type="button"
                size="sm"
                variant={status === s ? 'default' : 'ghost'}
                className="h-7 px-2 text-xs"
                onClick={() => setStatus(s)}
              >
                {s === 'active' ? 'Ativos' : s === 'inactive' ? 'Inativos' : 'Todos'}
              </Button>
            ))}
            <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <Switch checked={onlyWithStock} onCheckedChange={setOnlyWithStock} className="scale-75" />
              Em estoque
            </div>
          </div>
          <CommandList>
            <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
            <CommandGroup>
              {filtered.map((p) => {
                const inStockCount = p.variations.filter((v) => v.in_stock).length;
                const prices = p.variations.map((v) =>
                  v.is_offer && v.offer_price > 0 ? v.offer_price : v.price,
                ).filter((n) => n > 0);
                const minPrice = prices.length ? Math.min(...prices) : 0;
                const maxPrice = prices.length ? Math.max(...prices) : 0;
                const priceLabel = prices.length
                  ? minPrice === maxPrice
                    ? fmtBRL(minPrice)
                    : `${fmtBRL(minPrice)} – ${fmtBRL(maxPrice)}`
                  : '—';
                const allOut = p.variations.length > 0 && inStockCount === 0;
                return (
                  <CommandItem
                    key={p.id}
                    value={`${p.name} ${p.id}`}
                    onSelect={() => {
                      onChange(p.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={`mr-2 h-4 w-4 ${value === p.id ? 'opacity-100' : 'opacity-0'}`} />
                    <span
                      aria-hidden
                      className={`mr-2 h-2 w-2 shrink-0 rounded-full ${
                        allOut ? 'bg-destructive' : inStockCount > 0 ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                      }`}
                      title={allOut ? 'Sem estoque' : `${inStockCount} em estoque`}
                    />
                    <div className="flex flex-col flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm">{p.name}</span>
                        <span className="text-xs font-medium text-foreground shrink-0">{priceLabel}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {p.variations.length} {p.variations.length === 1 ? 'variação' : 'variações'}
                        {' · '}
                        {allOut ? (
                          <span className="text-destructive">sem estoque</span>
                        ) : (
                          <span className="text-emerald-600">{inStockCount} em estoque</span>
                        )}
                      </span>
                    </div>
                    {!p.active && <Badge variant="secondary" className="ml-2 text-[10px]">inativo</Badge>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function VariationPicker({
  variations,
  value,
  onChange,
  disabled,
}: {
  variations: Variation[];
  value: string | null;
  onChange: (variationId: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [onlyInStock, setOnlyInStock] = usePersistedState<boolean>(
    'combos:picker:variation:onlyInStock',
    false,
  );
  const [search, setSearch] = usePersistedState<string>('combos:picker:variation:search', '');
  const selected = value ? variations.find((v) => v.id === value) : null;
  const filtered = onlyInStock ? variations.filter((v) => v.in_stock) : variations;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {selected
              ? `${selected.dosage}${!selected.in_stock ? ' (sem estoque)' : ''}`
              : 'Qualquer'}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Buscar variação..."
            value={search}
            onValueChange={setSearch}
          />
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b text-xs text-muted-foreground">
            <Switch checked={onlyInStock} onCheckedChange={setOnlyInStock} className="scale-75" />
            Apenas em estoque
          </div>
          <CommandList>
            <CommandEmpty>Nenhuma variação.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="qualquer"
                onSelect={() => { onChange(null); setOpen(false); }}
              >
                <Check className={`mr-2 h-4 w-4 ${!value ? 'opacity-100' : 'opacity-0'}`} />
                <span className="text-sm">Qualquer variação</span>
              </CommandItem>
              {filtered.map((v) => (
                <CommandItem
                  key={v.id}
                  value={v.dosage}
                  onSelect={() => { onChange(v.id); setOpen(false); }}
                >
                  <Check className={`mr-2 h-4 w-4 ${value === v.id ? 'opacity-100' : 'opacity-0'}`} />
                  <span
                    aria-hidden
                    className={`mr-2 h-2 w-2 shrink-0 rounded-full ${
                      v.in_stock ? 'bg-emerald-500' : 'bg-destructive'
                    }`}
                    title={v.in_stock ? 'Em estoque' : 'Sem estoque'}
                  />
                  <span className="text-sm flex-1 truncate">{v.dosage}</span>
                  <div className="ml-2 flex items-center gap-2 shrink-0">
                    {v.is_offer && v.offer_price > 0 ? (
                      <>
                        <span className="text-[11px] text-muted-foreground line-through">{fmtBRL(v.price)}</span>
                        <span className="text-xs font-medium text-primary">{fmtBRL(v.offer_price)}</span>
                      </>
                    ) : (
                      <span className="text-xs font-medium text-foreground">{fmtBRL(v.price)}</span>
                    )}
                    {!v.in_stock && <Badge variant="secondary" className="text-[10px]">sem estoque</Badge>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function CombosManagerPage() {
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  if (isEditing) return <ComboForm comboId={id!} />;
  return <ComboList />;
}

function ComboList() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [combos, setCombos] = useState<Combo[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('combos' as any)
      .select('*, combo_items(count)')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Erro ao carregar combos', description: error.message, variant: 'destructive' });
    } else {
      const rows: Combo[] = (data as any[] || []).map((c) => ({
        ...c,
        items_count: c.combo_items?.[0]?.count ?? 0,
      }));
      setCombos(rows);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (combo: Combo) => {
    const { error } = await supabase.from('combos' as any).delete().eq('id', combo.id);
    if (error) toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Combo excluído' }); load(); }
  };

  const handleDuplicate = async (combo: Combo) => {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) { toast({ title: 'Sessão inválida', variant: 'destructive' }); return; }
    const baseSlug = `${combo.slug}-copia`;
    const { data: items } = await supabase.from('combo_items' as any).select('*').eq('combo_id', combo.id);
    const { data: newCombo, error } = await supabase
      .from('combos' as any)
      .insert({
        user_id: uid,
        name: `${combo.name} (cópia)`,
        subtitle: combo.subtitle,
        description: combo.description,
        slug: `${baseSlug}-${Date.now().toString(36)}`,
        image_url: combo.image_url,
        price: combo.price,
        compare_price: combo.compare_price,
        active: false,
        sort_order: combo.sort_order,
        max_installments: combo.max_installments,
        pix_discount_percent: combo.pix_discount_percent,
      })
      .select('id')
      .single();
    if (error || !newCombo) {
      toast({ title: 'Erro ao duplicar', description: error?.message, variant: 'destructive' });
      return;
    }
    const newId = (newCombo as any).id;
    if (items && items.length > 0) {
      await supabase.from('combo_items' as any).insert(
        (items as any[]).map((it) => ({
          combo_id: newId,
          product_id: it.product_id,
          variation_id: it.variation_id,
          quantity: it.quantity,
          sort_order: it.sort_order,
        })),
      );
    }
    toast({ title: 'Combo duplicado' });
    navigate(`/admin/combos/${newId}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
            <Boxes className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Combos de Produtos</h1>
            <p className="text-sm text-muted-foreground">Crie pacotes promocionais com preço fixo</p>
          </div>
        </div>
        <Button onClick={() => navigate('/admin/combos/novo')}>
          <Plus className="w-4 h-4 mr-1.5" /> Novo combo
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : combos.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Nenhum combo cadastrado ainda.
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {combos.map((c) => (
            <Card key={c.id} className="overflow-hidden">
              <div className="aspect-[16/9] bg-muted overflow-hidden">
                {c.image_url ? (
                  <img src={c.image_url} alt={c.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <Boxes className="w-10 h-10" />
                  </div>
                )}
              </div>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-foreground line-clamp-1">{c.name}</h3>
                    <p className="text-xs text-muted-foreground">/{c.slug}</p>
                  </div>
                  <Badge variant={c.active ? 'default' : 'secondary'}>
                    {c.active ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="space-y-0.5">
                    {c.compare_price > 0 && (
                      <p className="text-xs text-muted-foreground line-through">{fmtBRL(c.compare_price)}</p>
                    )}
                    <p className="text-lg font-bold text-primary">{fmtBRL(c.price)}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{c.items_count} {c.items_count === 1 ? 'item' : 'itens'}</p>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate(`/admin/combos/${c.id}`)}>
                    <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleDuplicate(c)}>
                    <CopyIcon className="w-3.5 h-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" className="text-destructive hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <DeleteComboConfirm combo={c} onConfirm={() => handleDelete(c)} />
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function DeleteComboConfirm({ combo, onConfirm }: { combo: Combo; onConfirm: () => void }) {
  const [text, setText] = useState('');
  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Excluir combo "{combo.name}"?</AlertDialogTitle>
        <AlertDialogDescription>
          Esta ação é permanente. Digite <strong>EXCLUIR</strong> para confirmar.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="EXCLUIR" />
      <AlertDialogFooter>
        <AlertDialogCancel>Cancelar</AlertDialogCancel>
        <AlertDialogAction
          disabled={text !== 'EXCLUIR'}
          onClick={onConfirm}
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          Excluir
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}

function ComboForm({ comboId }: { comboId: string }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const isNew = comboId === 'novo';

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);

  const [combo, setCombo] = useState<Combo>({
    id: '',
    name: '',
    subtitle: '',
    description: '',
    slug: '',
    image_url: '',
    price: 0,
    compare_price: 0,
    active: true,
    sort_order: 0,
    max_installments: 6,
    pix_discount_percent: 0,
  });
  const [items, setItems] = useState<ComboItemRow[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: prods }, comboRes] = await Promise.all([
        supabase.from('products').select('id, name, active, product_variations(id, dosage, in_stock, price, offer_price, is_offer)').order('name'),
        isNew ? Promise.resolve({ data: null }) : supabase.from('combos' as any).select('*, combo_items(*)').eq('id', comboId).maybeSingle(),
      ]);
      const productList: Product[] = (prods as any[] || []).map((p) => ({
        id: p.id,
        name: p.name,
        active: p.active,
        variations: (p.product_variations || []).map((v: any) => ({
          id: v.id, dosage: v.dosage, in_stock: v.in_stock,
          price: Number(v.price) || 0,
          offer_price: Number(v.offer_price) || 0,
          is_offer: !!v.is_offer,
        })),
      }));
      setProducts(productList);
      if (!isNew && (comboRes as any).data) {
        const c: any = (comboRes as any).data;
        setCombo({
          id: c.id, name: c.name, subtitle: c.subtitle || '', description: c.description || '',
          slug: c.slug, image_url: c.image_url || '',
          price: Number(c.price) || 0, compare_price: Number(c.compare_price) || 0,
          active: c.active, sort_order: c.sort_order ?? 0,
          max_installments: c.max_installments ?? 6,
          pix_discount_percent: Number(c.pix_discount_percent) || 0,
        });
        setItems(
          ((c.combo_items || []) as any[])
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((it) => ({
              id: it.id,
              product_id: it.product_id,
              variation_id: it.variation_id,
              quantity: it.quantity,
              sort_order: it.sort_order,
            })),
        );
      }
      setLoading(false);
    })();
  }, [comboId, isNew]);

  useEffect(() => {
    if (isNew && combo.name && !combo.slug) {
      setCombo((prev) => ({ ...prev, slug: slugify(prev.name) }));
    }
  }, [combo.name, isNew, combo.slug]);

  const handleUploadImage = async (file: File) => {
    setUploadingImg(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `combos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from('product-images').getPublicUrl(path);
      setCombo((prev) => ({ ...prev, image_url: data.publicUrl }));
    } catch (e: any) {
      toast({ title: 'Erro no upload', description: e.message, variant: 'destructive' });
    } finally {
      setUploadingImg(false);
    }
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { id: `tmp-${Date.now()}-${Math.random()}`, product_id: '', variation_id: null, quantity: 1, sort_order: prev.length },
    ]);
  };

  const updateItem = (idx: number, patch: Partial<ComboItemRow>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx).map((it, i) => ({ ...it, sort_order: i })));
  };

  const getItemUnitPrice = (it: ComboItemRow): number => {
    const prod = products.find((p) => p.id === it.product_id);
    if (!prod) return 0;
    const variation = it.variation_id
      ? prod.variations.find((v) => v.id === it.variation_id)
      : prod.variations[0];
    if (!variation) return 0;
    const effective = variation.is_offer && variation.offer_price > 0
      ? variation.offer_price
      : variation.price;
    return round2(effective);
  };

  const validItemsForSummary = items.filter((it) => it.product_id && it.quantity > 0);
  const originalTotal = round2(
    validItemsForSummary.reduce(
      (sum, it) => sum + round2(getItemUnitPrice(it) * it.quantity),
      0,
    ),
  );
  const comboPrice = round2(combo.price || 0);
  const savingsValue = round2(Math.max(0, originalTotal - comboPrice));
  const savingsPercent = originalTotal > 0 ? Math.round((savingsValue / originalTotal) * 100) : 0;

  const handleSave = async () => {
    if (!combo.name.trim()) { toast({ title: 'Informe o nome do combo', variant: 'destructive' }); return; }
    if (combo.price <= 0) { toast({ title: 'Informe o preço do combo', variant: 'destructive' }); return; }
    const validItems = items.filter((it) => it.product_id && it.quantity > 0);
    if (validItems.length < 2) {
      toast({ title: 'Adicione pelo menos 2 itens válidos ao combo', description: 'Cada item precisa ter um produto selecionado e quantidade maior que zero.', variant: 'destructive' });
      return;
    }
    const mismatched = validItems.find((it) => {
      if (!it.variation_id) return false;
      const prod = products.find((p) => p.id === it.product_id);
      if (!prod) return true;
      return !prod.variations.some((v) => v.id === it.variation_id);
    });
    if (mismatched) {
      const prodName = products.find((p) => p.id === mismatched.product_id)?.name || 'produto';
      toast({ title: 'Variação inválida', description: `A variação selecionada não pertence ao produto "${prodName}". Selecione uma variação válida ou "Qualquer variação".`, variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error('Sessão inválida');

      const slug = combo.slug?.trim() || slugify(combo.name);

      const payload: any = {
        user_id: uid,
        name: combo.name.trim(),
        subtitle: combo.subtitle,
        description: combo.description,
        slug,
        image_url: combo.image_url,
        price: combo.price,
        compare_price: combo.compare_price,
        active: combo.active,
        sort_order: combo.sort_order,
        max_installments: combo.max_installments,
        pix_discount_percent: combo.pix_discount_percent,
      };

      let savedId = comboId;
      if (isNew) {
        const { data, error } = await supabase.from('combos' as any).insert(payload).select('id').single();
        if (error) throw error;
        savedId = (data as any).id;
      } else {
        const { error } = await supabase.from('combos' as any).update(payload).eq('id', comboId);
        if (error) throw error;
      }

      // Replace items
      await supabase.from('combo_items' as any).delete().eq('combo_id', savedId);
      if (validItems.length > 0) {
        const rows = validItems.map((it, i) => ({
          combo_id: savedId,
          product_id: it.product_id,
          variation_id: it.variation_id || null,
          quantity: it.quantity,
          sort_order: i,
        }));
        const { error } = await supabase.from('combo_items' as any).insert(rows);
        if (error) throw error;
      }
      toast({ title: 'Combo salvo' });
      navigate('/admin/combos');
    } catch (e: any) {
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const previewUrl = combo.slug ? `/combo/${combo.slug}` : '';

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/combos')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
        </Button>
        <div className="flex gap-2">
          {previewUrl && !isNew && (
            <Button asChild variant="outline" size="sm">
              <Link to={previewUrl} target="_blank">Visualizar</Link>
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
            Salvar
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Informações básicas</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={combo.name} onChange={(e) => setCombo({ ...combo, name: e.target.value })} placeholder="Ex: Combo Emagrecedor 60 dias" />
            </div>
            <div className="space-y-1.5">
              <Label>Slug (URL)</Label>
              <Input value={combo.slug} onChange={(e) => setCombo({ ...combo, slug: slugify(e.target.value) })} placeholder="combo-emagrecedor-60-dias" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Subtítulo</Label>
            <Input value={combo.subtitle} onChange={(e) => setCombo({ ...combo, subtitle: e.target.value })} placeholder="Tratamento completo com desconto" />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea rows={4} value={combo.description} onChange={(e) => setCombo({ ...combo, description: e.target.value })} placeholder="Detalhes que aparecem na página do combo" />
          </div>

          <div className="space-y-1.5">
            <Label>Imagem do combo</Label>
            <div className="flex items-center gap-3">
              {combo.image_url ? (
                <img src={combo.image_url} alt="combo" className="w-20 h-20 object-cover rounded-lg border" />
              ) : (
                <div className="w-20 h-20 rounded-lg border bg-muted flex items-center justify-center text-muted-foreground">
                  <Boxes className="w-7 h-7" />
                </div>
              )}
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadImage(f); }}
                />
                <span className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-md border hover:bg-muted">
                  {uploadingImg ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                  Enviar imagem
                </span>
              </label>
              {combo.image_url && (
                <Button variant="ghost" size="sm" onClick={() => setCombo({ ...combo, image_url: '' })}>
                  Remover
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Preço e pagamento</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Preço do combo (R$) *</Label>
              <Input type="number" min={0} step="0.01" value={combo.price} onChange={(e) => setCombo({ ...combo, price: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label>Preço comparativo (riscado)</Label>
              <Input type="number" min={0} step="0.01" value={combo.compare_price} onChange={(e) => setCombo({ ...combo, compare_price: Number(e.target.value) })} />
              {originalTotal > 0 && Math.abs(originalTotal - combo.compare_price) > 0.01 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-primary"
                  onClick={() => setCombo({ ...combo, compare_price: Number(originalTotal.toFixed(2)) })}
                >
                  <Wand2 className="w-3 h-3 mr-1" />
                  Usar soma dos itens ({fmtBRL(originalTotal)})
                </Button>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Parcelas máximas</Label>
              <Input type="number" min={1} max={12} value={combo.max_installments} onChange={(e) => setCombo({ ...combo, max_installments: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label>Desconto PIX (%)</Label>
              <Input type="number" min={0} max={50} value={combo.pix_discount_percent} onChange={(e) => setCombo({ ...combo, pix_discount_percent: Number(e.target.value) })} />
            </div>
          </div>
          <div className="flex items-center justify-between border rounded-lg p-3">
            <div>
              <p className="font-medium text-foreground">Combo ativo</p>
              <p className="text-xs text-muted-foreground">Aparece no catálogo e pode ser comprado</p>
            </div>
            <Switch checked={combo.active} onCheckedChange={(v) => setCombo({ ...combo, active: v })} />
          </div>
          <div className="space-y-1.5">
            <Label>Ordem de exibição</Label>
            <Input type="number" value={combo.sort_order} onChange={(e) => setCombo({ ...combo, sort_order: Number(e.target.value) })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Itens do combo</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Adicione pelo menos 2 produtos para formar o combo</p>
          </div>
          <Button size="sm" onClick={addItem}><Plus className="w-4 h-4 mr-1" /> Adicionar item</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum item adicionado ao combo.</p>
          ) : (
            items.map((it, idx) => {
              const prod = products.find((p) => p.id === it.product_id);
              const unit = getItemUnitPrice(it);
              return (
                <div key={it.id} className="grid grid-cols-12 gap-2 items-end border rounded-lg p-3">
                  <div className="hidden md:flex col-span-1 items-center text-muted-foreground"><GripVertical className="w-4 h-4" /></div>
                  <div className="col-span-12 md:col-span-5 space-y-1">
                    <Label className="text-xs">Produto</Label>
                    <ProductPicker
                      products={products}
                      value={it.product_id}
                      onChange={(pid) => updateItem(idx, { product_id: pid, variation_id: null })}
                    />
                  </div>
                  <div className="col-span-7 md:col-span-3 space-y-1">
                    <Label className="text-xs">Variação</Label>
                    <VariationPicker
                      variations={prod?.variations || []}
                      value={it.variation_id}
                      onChange={(vid) => updateItem(idx, { variation_id: vid })}
                      disabled={!prod}
                    />
                  </div>
                  <div className="col-span-3 md:col-span-2 space-y-1">
                    <Label className="text-xs">Qtd</Label>
                    <Input type="number" min={1} value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Math.max(1, Number(e.target.value)) })} />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <Button variant="ghost" size="icon" onClick={() => removeItem(idx)} className="text-destructive hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  {prod && unit > 0 && (
                    <div className="col-span-12 text-xs text-muted-foreground pl-1">
                      {it.quantity}× {fmtBRL(unit)} = <span className="font-medium text-foreground">{fmtBRL(unit * it.quantity)}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {validItemsForSummary.length === 1 && (
            <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded-md p-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>Adicione mais um produto para que o combo fique ativo no catálogo.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {validItemsForSummary.length >= 2 && (
        <Card className="border-primary/30 bg-primary/[0.03]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingDown className="w-5 h-5 text-primary" />
              Resumo da oferta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Soma dos produtos avulsos</span>
              <span className="font-medium text-foreground line-through">{fmtBRL(originalTotal)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Preço do combo</span>
              <span className="font-bold text-primary text-lg">{fmtBRL(combo.price)}</span>
            </div>
            <div className="border-t pt-3 flex items-center justify-between">
              <span className="text-sm font-medium">Cliente economiza</span>
              {savingsValue > 0 ? (
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-600 hover:bg-green-600 text-white">−{savingsPercent}%</Badge>
                  <span className="font-bold text-green-600">{fmtBRL(savingsValue)}</span>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">Defina um preço de combo menor que a soma para gerar economia</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}