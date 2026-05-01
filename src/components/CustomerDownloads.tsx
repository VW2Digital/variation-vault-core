import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Download, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface DownloadableFile {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  product_name: string;
  variation_dosage: string;
  display_name: string | null;
  cover_image_url: string | null;
  sort_order: number;
}

const PAID = ['PAID', 'CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'];

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const CustomerDownloads = ({ userId }: { userId: string }) => {
  const { toast } = useToast();
  const [files, setFiles] = useState<DownloadableFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        // 1. Get paid orders for user
        const { data: orders } = await supabase
          .from('orders')
          .select('product_name, status')
          .eq('customer_user_id', userId);

        const paidProductNames = (orders || [])
          .filter((o) => PAID.includes(String(o.status).toUpperCase()))
          .map((o) => o.product_name)
          .filter(Boolean);

        if (paidProductNames.length === 0) {
          if (!cancelled) setFiles([]);
          return;
        }

        // 2. Find products whose name is contained in any paid order's product_name
        const { data: products } = await supabase
          .from('products')
          .select('id, name');

        const matchedProductIds = (products || [])
          .filter((p: any) =>
            paidProductNames.some((pn) =>
              String(pn).toLowerCase().includes(String(p.name).toLowerCase()),
            ),
          )
          .map((p: any) => p.id);

        if (matchedProductIds.length === 0) {
          if (!cancelled) setFiles([]);
          return;
        }

        // 3. Get digital variations of those products
        const { data: variations } = await supabase
          .from('product_variations')
          .select('id, dosage, product_id, is_digital, products:product_id(name)')
          .in('product_id', matchedProductIds)
          .eq('is_digital', true);

        const varIds = (variations || []).map((v: any) => v.id);
        if (varIds.length === 0) {
          if (!cancelled) setFiles([]);
          return;
        }

        // 4. Get the digital files for those variations
        const { data: dfiles, error: dErr } = await supabase
          .from('product_variation_files' as any)
          .select('id, variation_id, file_name, file_size, mime_type, display_name, cover_image_url, sort_order')
          .in('variation_id', varIds)
          .order('sort_order', { ascending: true });

        if (dErr) throw dErr;

        const varMap = new Map(
          (variations || []).map((v: any) => [
            v.id,
            { dosage: v.dosage, productName: v.products?.name ?? '' },
          ]),
        );

        const list: DownloadableFile[] = ((dfiles as any[]) || []).map((f: any) => ({
          id: f.id,
          file_name: f.file_name,
          file_size: f.file_size,
          mime_type: f.mime_type,
          product_name: varMap.get(f.variation_id)?.productName ?? '',
          variation_dosage: varMap.get(f.variation_id)?.dosage ?? '',
          display_name: f.display_name ?? null,
          cover_image_url: f.cover_image_url ?? null,
          sort_order: f.sort_order ?? 0,
        }));

        if (!cancelled) setFiles(list);
      } catch (err: any) {
        if (!cancelled) {
          toast({ title: 'Erro ao carregar downloads', description: err.message, variant: 'destructive' });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [userId, toast]);

  const handleDownload = async (file: DownloadableFile) => {
    setDownloading(file.id);
    try {
      const { data, error } = await supabase.functions.invoke('download-digital-file', {
        body: { file_id: file.id },
      });
      if (error) throw error;
      if (!data?.url) throw new Error('Link de download indisponível');
      window.open(data.url, '_blank', 'noopener');
    } catch (err: any) {
      toast({ title: 'Erro ao baixar', description: err.message, variant: 'destructive' });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Download className="w-5 h-5" /> Meus Downloads
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <Download className="w-10 h-10 text-muted-foreground/40 mx-auto" />
            <p className="text-sm text-muted-foreground">
              Você ainda não possui produtos digitais disponíveis para download.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-3 border border-border/50 rounded-lg p-3"
              >
                <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                  {f.cover_image_url ? (
                    <img
                      src={f.cover_image_url}
                      alt={`Capa de ${f.display_name || f.file_name}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <FileText className="w-5 h-5 text-primary" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {f.display_name || f.file_name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {f.product_name}
                    {f.variation_dosage ? ` · ${f.variation_dosage}` : ''} · {formatBytes(f.file_size)}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleDownload(f)}
                  disabled={downloading === f.id}
                  className="gap-1 shrink-0"
                >
                  {downloading === f.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  Baixar
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CustomerDownloads;