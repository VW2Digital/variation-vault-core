import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Loader2,
  FileUp,
  FileText,
  Trash2,
  Download,
  ArrowUp,
  ArrowDown,
  Pencil,
  Check,
  X,
  ImagePlus,
  Image as ImageIcon,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface DigitalFile {
  id: string;
  variation_id: string;
  file_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  sort_order: number;
  display_name: string | null;
  cover_image_url: string | null;
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [coverUploadingId, setCoverUploadingId] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [coverTargetId, setCoverTargetId] = useState<string | null>(null);

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
      // Remove a capa do storage também (se houver)
      if (file.cover_image_url) {
        const marker = '/digital-file-covers/';
        const idx = file.cover_image_url.indexOf(marker);
        if (idx >= 0) {
          const objectPath = file.cover_image_url.substring(idx + marker.length);
          await supabase.storage.from('digital-file-covers').remove([objectPath]);
        }
      }
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

  // ── Renomear (rótulo de exibição) ─────────────────────────────────
  const startEdit = (f: DigitalFile) => {
    setEditingId(f.id);
    setEditingValue(f.display_name || f.file_name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingValue('');
  };

  const saveEdit = async (f: DigitalFile) => {
    const trimmed = editingValue.trim();
    if (!trimmed) {
      toast({ title: 'Nome não pode ficar vazio', variant: 'destructive' });
      return;
    }
    try {
      const { error } = await supabase
        .from('product_variation_files' as any)
        .update({ display_name: trimmed } as any)
        .eq('id', f.id);
      if (error) throw error;
      setFiles((prev) => prev.map((x) => (x.id === f.id ? { ...x, display_name: trimmed } : x)));
      cancelEdit();
    } catch (err: any) {
      toast({ title: 'Erro ao renomear', description: err.message, variant: 'destructive' });
    }
  };

  // ── Reordenar (subir / descer) ─────────────────────────────────────
  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= files.length) return;
    const a = files[index];
    const b = files[target];
    // Atualização otimista
    const reordered = [...files];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setFiles(reordered.map((f, i) => ({ ...f, sort_order: i })));

    try {
      const { error: e1 } = await supabase
        .from('product_variation_files' as any)
        .update({ sort_order: b.sort_order } as any)
        .eq('id', a.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from('product_variation_files' as any)
        .update({ sort_order: a.sort_order } as any)
        .eq('id', b.id);
      if (e2) throw e2;
      // Garante consistência caso os sort_order anteriores fossem iguais/duplicados
      await load();
    } catch (err: any) {
      toast({ title: 'Erro ao reordenar', description: err.message, variant: 'destructive' });
      await load();
    }
  };

  // ── Capa (upload de imagem) ────────────────────────────────────────
  const triggerCoverPick = (fileId: string) => {
    setCoverTargetId(fileId);
    coverInputRef.current?.click();
  };

  const handleCoverUpload = async (fileList: FileList | null) => {
    const targetId = coverTargetId;
    setCoverTargetId(null);
    if (!fileList || fileList.length === 0 || !targetId) return;
    const img = fileList[0];
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(img.type)) {
      toast({ title: 'Capa deve ser JPG, PNG ou WEBP', variant: 'destructive' });
      return;
    }
    if (img.size > 5 * 1024 * 1024) {
      toast({ title: 'Capa deve ter no máximo 5MB', variant: 'destructive' });
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) {
      toast({ title: 'Sessão expirada', variant: 'destructive' });
      return;
    }
    setCoverUploadingId(targetId);
    try {
      const target = files.find((f) => f.id === targetId);
      // Remove capa anterior (se existir)
      if (target?.cover_image_url) {
        const marker = '/digital-file-covers/';
        const idx = target.cover_image_url.indexOf(marker);
        if (idx >= 0) {
          const oldPath = target.cover_image_url.substring(idx + marker.length);
          await supabase.storage.from('digital-file-covers').remove([oldPath]);
        }
      }
      const path = `${userId}/${targetId}/${crypto.randomUUID()}-${img.name}`;
      const { error: upErr } = await supabase.storage
        .from('digital-file-covers')
        .upload(path, img, { contentType: img.type, upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('digital-file-covers').getPublicUrl(path);
      const publicUrl = pub.publicUrl;
      const { error: updErr } = await supabase
        .from('product_variation_files' as any)
        .update({ cover_image_url: publicUrl } as any)
        .eq('id', targetId);
      if (updErr) throw updErr;
      setFiles((prev) => prev.map((x) => (x.id === targetId ? { ...x, cover_image_url: publicUrl } : x)));
      toast({ title: 'Capa atualizada' });
    } catch (err: any) {
      toast({ title: 'Erro ao enviar capa', description: err.message, variant: 'destructive' });
    } finally {
      setCoverUploadingId(null);
    }
  };

  const removeCover = async (file: DigitalFile) => {
    if (!file.cover_image_url) return;
    if (!confirm('Remover a capa deste arquivo?')) return;
    try {
      const marker = '/digital-file-covers/';
      const idx = file.cover_image_url.indexOf(marker);
      if (idx >= 0) {
        const objectPath = file.cover_image_url.substring(idx + marker.length);
        await supabase.storage.from('digital-file-covers').remove([objectPath]);
      }
      const { error } = await supabase
        .from('product_variation_files' as any)
        .update({ cover_image_url: null } as any)
        .eq('id', file.id);
      if (error) throw error;
      setFiles((prev) => prev.map((x) => (x.id === file.id ? { ...x, cover_image_url: null } : x)));
    } catch (err: any) {
      toast({ title: 'Erro ao remover capa', description: err.message, variant: 'destructive' });
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
        <div className="space-y-2">
          {files.map((f, idx) => {
            const isEditing = editingId === f.id;
            const isUploadingCover = coverUploadingId === f.id;
            return (
              <div
                key={f.id}
                className="flex items-stretch gap-2 bg-background/80 rounded-md px-2 py-2 border border-border/40"
              >
                {/* Capa / thumbnail */}
                <div className="relative w-12 h-12 shrink-0 rounded overflow-hidden bg-muted/40 border border-border/40 flex items-center justify-center group">
                  {f.cover_image_url ? (
                    <img
                      src={f.cover_image_url}
                      alt={`Capa de ${f.display_name || f.file_name}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="w-4 h-4 text-muted-foreground" />
                  )}
                  {isUploadingCover && (
                    <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                      <Loader2 className="w-3 h-3 animate-spin" />
                    </div>
                  )}
                </div>

                {/* Conteúdo */}
                <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      <Input
                        autoFocus
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); saveEdit(f); }
                          if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                        }}
                        className="h-7 text-xs"
                        placeholder="Nome exibido ao cliente"
                      />
                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-primary" onClick={() => saveEdit(f)}>
                        <Check className="w-3 h-3" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={cancelEdit}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-1 min-w-0">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <p className="text-xs font-medium text-foreground truncate">
                          {f.display_name || f.file_name}
                        </p>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {formatBytes(f.file_size)}
                        {f.display_name ? ` · ${f.file_name}` : ''}
                      </p>
                    </>
                  )}
                </div>

                {/* Ações */}
                {!isEditing && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      title="Mover para cima"
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                    >
                      <ArrowUp className="w-3 h-3" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      title="Mover para baixo"
                      onClick={() => move(idx, 1)}
                      disabled={idx === files.length - 1}
                    >
                      <ArrowDown className="w-3 h-3" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      title={f.cover_image_url ? 'Trocar capa' : 'Adicionar capa'}
                      onClick={() => triggerCoverPick(f.id)}
                      disabled={isUploadingCover}
                    >
                      <ImagePlus className="w-3 h-3" />
                    </Button>
                    {f.cover_image_url && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-muted-foreground"
                        title="Remover capa"
                        onClick={() => removeCover(f)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      title="Renomear"
                      onClick={() => startEdit(f)}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive"
                      title="Excluir"
                      onClick={() => handleDelete(f)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Input oculto para upload de capa */}
          <input
            ref={coverInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => { handleCoverUpload(e.target.files); e.target.value = ''; }}
          />
        </div>
      )}
    </div>
  );
};

export default DigitalFilesManager;