import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { createProduct } from '@/lib/api';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Upload, Download, FileText, CheckCircle2, XCircle, Loader2, ArrowLeft, Info } from 'lucide-react';

/**
 * Cabeçalhos esperados no CSV (a ordem não importa, apenas o nome).
 * Linhas com o mesmo `name` são agrupadas como variações do mesmo produto.
 */
const TEMPLATE_HEADERS = [
  'name',
  'subtitle',
  'description',
  'category',
  'fantasy_name',
  'active_ingredient',
  'pharma_form',
  'administration_route',
  'frequency',
  'free_shipping',
  'free_shipping_min_value',
  'is_bestseller',
  'pix_discount_percent',
  'max_installments',
  'installments_interest',
  'images',
  'variation_dosage',
  'variation_subtitle',
  'variation_price',
  'variation_offer_price',
  'variation_in_stock',
  'variation_is_offer',
  'variation_stock_quantity',
  'variation_is_digital',
  'variation_image_url',
  'variation_images',
];

const TEMPLATE_ROWS = [
  [
    'Tadalafila',
    'Comprimido revestido',
    'Indicado para disfunção erétil',
    'Estimulantes',
    '',
    'Tadalafila',
    'Comprimido',
    'Oral',
    '1x ao dia',
    'true',
    '0',
    'false',
    '5',
    '6',
    'sem_juros',
    '',
    '20mg',
    'Caixa com 4 comprimidos',
    '89.90',
    '69.90',
    'true',
    'true',
    '100',
    'false',
    '',
    '',
  ],
  [
    'Tadalafila',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '40mg',
    'Caixa com 8 comprimidos',
    '149.90',
    '129.90',
    'true',
    'true',
    '50',
    'false',
    '',
    '',
  ],
];

/** Parser CSV simples com suporte a aspas duplas e vírgulas dentro de campos. */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',' || ch === ';') { cur.push(field); field = ''; }
      else if (ch === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
      else if (ch === '\r') { /* ignora */ }
      else field += ch;
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
}

function toBool(v: string | undefined, fallback = false): boolean {
  if (v === undefined || v === null) return fallback;
  const s = String(v).trim().toLowerCase();
  if (['true', '1', 'sim', 'yes', 'y', 's'].includes(s)) return true;
  if (['false', '0', 'nao', 'não', 'no', 'n', ''].includes(s)) return false;
  return fallback;
}

function toNumber(v: string | undefined, fallback = 0): number {
  if (v === undefined || v === null || String(v).trim() === '') return fallback;
  const n = Number(String(v).replace(',', '.').replace(/[^\d.\-]/g, ''));
  return isNaN(n) ? fallback : n;
}

function splitList(v: string | undefined): string[] {
  if (!v) return [];
  return String(v)
    .split('|')
    .map(s => s.trim())
    .filter(Boolean);
}

function buildCSV(headers: string[], rows: string[][]): string {
  const escape = (val: string) => {
    if (/[",\n;]/.test(val)) return `"${val.replace(/"/g, '""')}"`;
    return val;
  };
  return [headers, ...rows].map(r => r.map(c => escape(c ?? '')).join(',')).join('\n');
}

interface ImportResult {
  productName: string;
  status: 'success' | 'error';
  message?: string;
}

const ProductImportCSV = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<any[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const handleDownloadTemplate = () => {
    const csv = buildCSV(TEMPLATE_HEADERS, TEMPLATE_ROWS);
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template-produtos.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (file: File) => {
    setParsing(true);
    setErrors([]);
    setResults([]);
    setPreview([]);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length < 2) throw new Error('CSV vazio ou sem dados');

      const headers = rows[0].map(h => h.trim().toLowerCase());
      const dataRows = rows.slice(1);

      // Validar cabeçalhos mínimos
      const required = ['name', 'variation_dosage', 'variation_price'];
      const missing = required.filter(r => !headers.includes(r));
      if (missing.length) {
        throw new Error(`Cabeçalhos obrigatórios ausentes: ${missing.join(', ')}`);
      }

      const idx = (h: string) => headers.indexOf(h);
      const get = (row: string[], h: string) => {
        const i = idx(h);
        return i >= 0 ? (row[i] ?? '').trim() : '';
      };

      // Agrupar por name
      const grouped = new Map<string, any>();
      const localErrors: string[] = [];

      dataRows.forEach((row, i) => {
        const name = get(row, 'name');
        const dosage = get(row, 'variation_dosage');
        const priceStr = get(row, 'variation_price');

        if (!name) {
          localErrors.push(`Linha ${i + 2}: campo "name" vazio — ignorada.`);
          return;
        }
        if (!dosage) {
          localErrors.push(`Linha ${i + 2} (${name}): "variation_dosage" vazio — ignorada.`);
          return;
        }
        if (!priceStr) {
          localErrors.push(`Linha ${i + 2} (${name}): "variation_price" vazio — ignorada.`);
          return;
        }

        if (!grouped.has(name)) {
          grouped.set(name, {
            name,
            subtitle: get(row, 'subtitle'),
            description: get(row, 'description'),
            category: get(row, 'category'),
            fantasy_name: get(row, 'fantasy_name'),
            active_ingredient: get(row, 'active_ingredient'),
            pharma_form: get(row, 'pharma_form'),
            administration_route: get(row, 'administration_route'),
            frequency: get(row, 'frequency'),
            free_shipping: toBool(get(row, 'free_shipping'), false),
            free_shipping_min_value: toNumber(get(row, 'free_shipping_min_value'), 0),
            is_bestseller: toBool(get(row, 'is_bestseller'), false),
            pix_discount_percent: toNumber(get(row, 'pix_discount_percent'), 0),
            max_installments: toNumber(get(row, 'max_installments'), 6),
            installments_interest: get(row, 'installments_interest') || 'sem_juros',
            images: splitList(get(row, 'images')),
            variations: [],
          });
        }

        grouped.get(name).variations.push({
          dosage,
          subtitle: get(row, 'variation_subtitle'),
          price: toNumber(priceStr, 0),
          offer_price: toNumber(get(row, 'variation_offer_price'), 0),
          in_stock: toBool(get(row, 'variation_in_stock'), true),
          is_offer: toBool(get(row, 'variation_is_offer'), false),
          stock_quantity: toNumber(get(row, 'variation_stock_quantity'), 0),
          is_digital: toBool(get(row, 'variation_is_digital'), false),
          image_url: get(row, 'variation_image_url'),
          images: splitList(get(row, 'variation_images')),
        });
      });

      setPreview([...grouped.values()]);
      setErrors(localErrors);
    } catch (err: any) {
      toast({ title: 'Erro ao ler CSV', description: err.message, variant: 'destructive' });
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (preview.length === 0) return;
    setImporting(true);
    const out: ImportResult[] = [];
    for (const p of preview) {
      try {
        await createProduct(p);
        out.push({ productName: p.name, status: 'success' });
      } catch (err: any) {
        out.push({ productName: p.name, status: 'error', message: err.message });
      }
      setResults([...out]);
    }
    setImporting(false);
    const ok = out.filter(r => r.status === 'success').length;
    const fail = out.length - ok;
    toast({
      title: 'Importação concluída',
      description: `${ok} produto(s) importado(s)${fail ? `, ${fail} com erro` : ''}.`,
      variant: fail > 0 ? 'destructive' : 'default',
    });
    if (ok > 0 && fail === 0) {
      setPreview([]);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Importar produtos via CSV"
        description="Cadastre vários produtos de uma vez. Linhas com o mesmo nome viram variações."
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/admin/produtos')}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar
          </Button>
        }
      />

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border border-border/60 text-sm">
            <Info className="w-4 h-4 mt-0.5 text-primary shrink-0" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">Como preencher</p>
              <ul className="list-disc pl-4 text-muted-foreground space-y-0.5 text-xs">
                <li>Campos obrigatórios: <code className="text-foreground">name</code>, <code className="text-foreground">variation_dosage</code>, <code className="text-foreground">variation_price</code>.</li>
                <li>Para múltiplas variações, repita o <code>name</code> em linhas seguintes mudando apenas os campos <code>variation_*</code>.</li>
                <li>Booleanos aceitam <code>true/false</code>, <code>sim/não</code> ou <code>1/0</code>.</li>
                <li>Para múltiplas imagens, separe URLs com <code>|</code> (ex.: <code>https://a.png|https://b.png</code>).</li>
              </ul>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
              <Download className="mr-1.5 h-4 w-4" /> Baixar template CSV
            </Button>
            <Button
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={parsing}
              className="bg-gradient-to-r from-primary to-accent text-primary-foreground"
            >
              {parsing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
              Selecionar arquivo CSV
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>

          {errors.length > 0 && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-1">
              <p className="text-xs font-semibold text-destructive">Avisos ({errors.length})</p>
              <ul className="text-xs text-destructive/90 space-y-0.5 max-h-32 overflow-auto">
                {errors.map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            </div>
          )}

          {preview.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Pré-visualização: {preview.length} produto(s), {preview.reduce((s, p) => s + p.variations.length, 0)} variação(ões)
                </h3>
                <Button
                  size="sm"
                  onClick={handleImport}
                  disabled={importing}
                  className="bg-gradient-to-r from-primary to-accent text-primary-foreground"
                >
                  {importing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                  Importar {preview.length} produto(s)
                </Button>
              </div>

              <div className="border border-border/60 rounded-lg divide-y divide-border/40 max-h-96 overflow-auto">
                {preview.map((p, i) => {
                  const result = results.find(r => r.productName === p.name);
                  return (
                    <div key={i} className="p-3 flex items-start gap-3">
                      <div className="shrink-0 mt-0.5">
                        {result?.status === 'success' && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                        {result?.status === 'error' && <XCircle className="w-4 h-4 text-destructive" />}
                        {!result && <FileText className="w-4 h-4 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        {p.subtitle && <p className="text-xs text-muted-foreground truncate">{p.subtitle}</p>}
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {p.variations.map((v: any, j: number) => (
                            <Badge key={j} variant="secondary" className="text-[10px]">
                              {v.dosage} — R$ {v.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </Badge>
                          ))}
                        </div>
                        {result?.status === 'error' && (
                          <p className="text-xs text-destructive mt-1">{result.message}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProductImportCSV;