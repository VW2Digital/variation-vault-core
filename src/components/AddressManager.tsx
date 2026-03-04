import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { MapPin, Plus, Trash2, Star, Loader2, X, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export interface Address {
  id: string;
  user_id: string;
  label: string;
  postal_code: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  is_default: boolean;
}

const AddressManager = () => {
  const { toast } = useToast();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fetchingCep, setFetchingCep] = useState(false);

  // Form fields
  const [label, setLabel] = useState('Casa');
  const [postalCode, setPostalCode] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [district, setDistrict] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  const fetchAddresses = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data, error } = await supabase
        .from('addresses')
        .select('*')
        .eq('user_id', session.user.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAddresses((data as any[]) || []);
    } catch (err: any) {
      toast({ title: 'Erro ao carregar endereços', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAddresses(); }, []);

  const resetForm = () => {
    setLabel('Casa');
    setPostalCode('');
    setStreet('');
    setNumber('');
    setComplement('');
    setDistrict('');
    setCity('');
    setState('');
    setIsDefault(false);
    setEditingId(null);
    setShowForm(false);
  };

  const formatCep = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 5) return digits;
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  };

  const fetchAddressByCep = async (cep: string) => {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) return;
    setFetchingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setStreet(data.logradouro || '');
        setDistrict(data.bairro || '');
        setCity(data.localidade || '');
        setState(data.uf || '');
      }
    } catch { /* ignore */ }
    finally { setFetchingCep(false); }
  };

  const handleSave = async () => {
    if (!postalCode.replace(/\D/g, '') || postalCode.replace(/\D/g, '').length < 8) {
      toast({ title: 'CEP inválido', variant: 'destructive' }); return;
    }
    if (!street.trim() || !number.trim() || !district.trim() || !city.trim() || !state.trim()) {
      toast({ title: 'Preencha todos os campos obrigatórios', variant: 'destructive' }); return;
    }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      const payload = {
        user_id: session.user.id,
        label: label.trim() || 'Casa',
        postal_code: postalCode.replace(/\D/g, ''),
        street: street.trim(),
        number: number.trim(),
        complement: complement.trim(),
        district: district.trim(),
        city: city.trim(),
        state: state.trim().toUpperCase(),
        is_default: isDefault || addresses.length === 0,
      };

      if (editingId) {
        const { error } = await supabase
          .from('addresses')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
        toast({ title: 'Endereço atualizado!' });
      } else {
        const { error } = await supabase
          .from('addresses')
          .insert(payload);
        if (error) throw error;
        toast({ title: 'Endereço salvo!' });
      }

      resetForm();
      await fetchAddresses();
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (addr: Address) => {
    setEditingId(addr.id);
    setLabel(addr.label);
    setPostalCode(formatCep(addr.postal_code));
    setStreet(addr.street);
    setNumber(addr.number);
    setComplement(addr.complement || '');
    setDistrict(addr.district);
    setCity(addr.city);
    setState(addr.state);
    setIsDefault(addr.is_default);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('addresses').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Endereço removido!' });
      await fetchAddresses();
    } catch (err: any) {
      toast({ title: 'Erro ao remover', description: err.message, variant: 'destructive' });
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const { error } = await supabase
        .from('addresses')
        .update({ is_default: true })
        .eq('id', id);
      if (error) throw error;
      toast({ title: 'Endereço padrão atualizado!' });
      await fetchAddresses();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <MapPin className="w-5 h-5" /> Meus Endereços
        </h3>
        {!showForm && (
          <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Novo Endereço
          </Button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {editingId ? 'Editar Endereço' : 'Novo Endereço'}
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={resetForm}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nome do endereço</Label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex: Casa, Trabalho" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">CEP *</Label>
                <div className="relative">
                  <Input
                    value={postalCode}
                    onChange={(e) => {
                      const formatted = formatCep(e.target.value);
                      setPostalCode(formatted);
                      if (formatted.replace(/\D/g, '').length === 8) fetchAddressByCep(formatted);
                    }}
                    placeholder="00000-000"
                  />
                  {fetchingCep && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-xs">Rua / Logradouro *</Label>
                <Input value={street} onChange={(e) => setStreet(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Número *</Label>
                <Input value={number} onChange={(e) => setNumber(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Complemento</Label>
                <Input value={complement} onChange={(e) => setComplement(e.target.value)} placeholder="Apto, Bloco..." />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Bairro *</Label>
                <Input value={district} onChange={(e) => setDistrict(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Cidade *</Label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">UF *</Label>
                  <Input value={state} onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))} maxLength={2} />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is-default"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="rounded border-border"
              />
              <Label htmlFor="is-default" className="text-sm text-muted-foreground cursor-pointer">
                Usar como endereço padrão
              </Label>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                {editingId ? 'Atualizar' : 'Salvar'}
              </Button>
              <Button variant="outline" onClick={resetForm}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : addresses.length === 0 && !showForm ? (
        <Card className="border-border/50">
          <CardContent className="py-10 text-center space-y-3">
            <MapPin className="w-10 h-10 text-muted-foreground/40 mx-auto" />
            <p className="text-sm text-muted-foreground">Nenhum endereço cadastrado</p>
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-1" /> Adicionar Endereço
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {addresses.map((addr) => (
            <Card key={addr.id} className={`border-border/50 ${addr.is_default ? 'ring-2 ring-primary/30' : ''}`}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground text-sm">{addr.label}</span>
                    {addr.is_default && (
                      <Badge variant="default" className="text-[10px] px-1.5 py-0">
                        <Star className="w-2.5 h-2.5 mr-0.5" /> Padrão
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground space-y-0.5">
                  <p>{addr.street}, {addr.number}{addr.complement ? ` - ${addr.complement}` : ''}</p>
                  <p>{addr.district} - {addr.city}/{addr.state}</p>
                  <p>CEP: {addr.postal_code.replace(/(\d{5})(\d{3})/, '$1-$2')}</p>
                </div>
                <div className="flex gap-1.5 pt-1">
                  <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleEdit(addr)}>
                    Editar
                  </Button>
                  {!addr.is_default && (
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleSetDefault(addr.id)}>
                      <Star className="w-3 h-3 mr-1" /> Tornar Padrão
                    </Button>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-xs h-7 text-destructive hover:text-destructive">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover endereço?</AlertDialogTitle>
                        <AlertDialogDescription>
                          O endereço "{addr.label}" será removido permanentemente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(addr.id)}>Remover</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AddressManager;
