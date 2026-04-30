import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, FileUp, FileText, Trash2, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface DigitalFile {
  id: string;
  variation_id: string;
  file_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  sort_order: number;
}

interface DigitalFilesManagerProps {
  variationId: string;
}

const MAX_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed',
  'image/jpeg',
  'image/png',
  'image/webp',
];

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const DigitalFilesManager = ({ variationId }: DigitalFilesManagerProps) => {
  const { toast } = useToast();
  const [files, setFiles] = useState<DigitalFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('product_variation_files' as any)
      .select('*')
      .eq('variation_id', variationId)
      .order('sort_order', { ascending: true });
    if (error) {
      toast({ title: 'Erro ao carregar arquivos', description: error.message, variant: 'destructive' });
    } else {
      setFiles((data as any[]) as DigitalFile[]);
    }
    setLoading(false);
  }, [variationId, toast]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) {
      toast({ title: 'Sessão expirada', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        if (file.size > MAX_SIZE) {
          toast({ title: `${file.name} é maior que 50MB`, variant: 'destructive' });
          continue;
        }
        if (!ALLOWED.includes(file.type) && file.type !== '') {
          toast({ title: `Tipo não permitido: ${file.name}`, description: file.type, variant: 'destructive' });
          continue;
        }
        const path = `${userId}/${variationId}/${crypto.randomUUID()}-${file.name}`;
        const { error: upErr } = await supabase.storage
          .from('digital-files')
          .upload(path, file, { contentType: file.type || 'application/octet-stream' });
        if (upErr) throw upErr;

        const { error: insErr } = await supabase
          .from('product_variation_files' as any)
          .insert({
            variation_id: variationId,
            file_path: path,
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type || 'application/octet-stream',
            sort_order: files.length,
          } as any);
        if (insErr) throw insErr;
      }
      toast({ title: 'Arquivos enviados!' });
      await load();
    } catch (err: any) {
      toast({ title: 'Erro no upload', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (file: DigitalFile) => {
    if (!confirm(`Remover "${file.file_name}"?`)) return;
    try {
      await supabase.storage.from('digital-files').remove([file.file_path]);
      const { error } = await supabase
        .from('product_variation_files' as any)
        .delete()
        .eq('id', file.id);
      if (error) throw error;
      toast({ title: 'Arquivo removido' });
      await load();
    } catch (err: any) {
      toast({ title: 'Erro ao remover', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-2 p-3 rounded-md border border-primary/30 bg-primary/5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold flex items-center gap-1.5">
          <Download className="w-3.5 h-3.5" /> Arquivos Digitais
        </Label>
        <label>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={uploading} asChild>
            <span className="cursor-pointer">
              {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileUp className="w-3 h-3" />}
              Enviar
            </span>
          </Button>
          <input
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.jpg,.jpeg,.png,.webp"
            disabled={uploading}
            onChange={(e) => { handleUpload(e.target.files); e.target.value = ''; }}
          />
        </label>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-3">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : files.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Nenhum arquivo enviado. PDF, DOC, XLS, PPT, TXT, ZIP, JPG, PNG, WEBP (máx. 50MB cada).
        </p>
      ) : (
        <div className="space-y-1.5">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-2 bg-background/80 rounded px-2 py-1.5 border border-border/40">
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{f.file_name}</p>
                <p className="text-[10px] text-muted-foreground">{formatBytes(f.file_size)}</p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-destructive shrink-0"
                onClick={() => handleDelete(f)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DigitalFilesManager;