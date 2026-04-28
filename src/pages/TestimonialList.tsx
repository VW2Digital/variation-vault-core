import { useState, useEffect, useRef } from 'react';
import { fetchTestimonials, createTestimonial, deleteTestimonial as apiDeleteTestimonial, uploadFile } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Video, Upload, Play, Link } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';

const TestimonialList = () => {
  const [testimonials, setTestimonials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [inputMode, setInputMode] = useState<'upload' | 'url'>('upload');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoPreview, setVideoPreview] = useState('');
  const [thumbnailBlob, setThumbnailBlob] = useState<Blob | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      setTestimonials(await fetchTestimonials());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'Max 50MB.', variant: 'destructive' });
      return;
    }
    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoPreview(url);

    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.addEventListener('loadeddata', () => { video.currentTime = 1; });
    video.addEventListener('seeked', () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            setThumbnailBlob(blob);
            setThumbnailPreview(URL.createObjectURL(blob));
          }
        }, 'image/jpeg', 0.8);
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (inputMode === 'upload' && !videoFile) return;
    if (inputMode === 'url' && !videoUrl.trim()) return;

    setIsProcessing(true);
    try {
      let finalVideoUrl = '';
      let thumbnailUrl = '';

      if (inputMode === 'upload' && videoFile) {
        const videoPath = `${crypto.randomUUID()}-${videoFile.name}`;
        finalVideoUrl = await uploadFile('testimonial-videos', videoPath, videoFile);

        if (thumbnailBlob) {
          const thumbPath = `${crypto.randomUUID()}-thumb.jpg`;
          thumbnailUrl = await uploadFile('testimonial-videos', thumbPath, new File([thumbnailBlob], 'thumb.jpg', { type: 'image/jpeg' }));
        }
      } else {
        finalVideoUrl = videoUrl.trim();
      }

      await createTestimonial({ name: name.trim(), video_url: finalVideoUrl, thumbnail_url: thumbnailUrl });
      toast({ title: 'Depoimento adicionado!' });
      resetForm();
      load();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiDeleteTestimonial(id);
      toast({ title: 'Depoimento excluído!' });
      load();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  };

  const resetForm = () => {
    setName('');
    setVideoFile(null);
    setVideoUrl('');
    setVideoPreview('');
    setThumbnailBlob(null);
    setThumbnailPreview('');
    setIsAdding(false);
    setInputMode('upload');
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  if (loading) return <p className="text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Depoimentos em Vídeo"
        description="Cadastre vídeos de clientes para exibir no catálogo."
        icon={Video}
        actions={
          <Button size="sm" onClick={() => setIsAdding(true)} className="bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-95 shadow-sm shadow-primary/20">
            <Plus className="mr-2 h-4 w-4" /> Novo Depoimento
          </Button>
        }
      />

      {isAdding && (
        <Card className="border-primary/30 border-2">
          <CardHeader><CardTitle className="text-lg">Adicionar Depoimento</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome do Cliente</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Maria Silva" required />
              </div>
              <div className="space-y-2">
                <Label>Tipo de entrada</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={inputMode === 'upload' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setInputMode('upload')}
                  >
                    <Upload className="mr-2 h-4 w-4" /> Enviar arquivo
                  </Button>
                  <Button
                    type="button"
                    variant={inputMode === 'url' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setInputMode('url')}
                  >
                    <Link className="mr-2 h-4 w-4" /> Colar URL
                  </Button>
                </div>
              </div>

              {inputMode === 'upload' ? (
                <div className="space-y-2">
                  <Label>Vídeo (max 50MB)</Label>
                  <div onClick={() => videoInputRef.current?.click()} className="border-2 border-dashed border-border hover:border-primary/50 rounded-xl p-8 text-center cursor-pointer transition-colors">
                    {videoPreview ? (
                      <div className="space-y-3">
                        <video src={videoPreview} className="max-h-48 mx-auto rounded-lg" controls />
                        <p className="text-sm text-muted-foreground">{videoFile?.name}</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload className="w-10 h-10 mx-auto text-muted-foreground/50" />
                        <p className="text-sm text-muted-foreground">Clique para selecionar um vídeo</p>
                        <p className="text-xs text-muted-foreground/70">MP4, MOV, WebM</p>
                      </div>
                    )}
                    <input ref={videoInputRef} type="file" accept="video/*" onChange={handleVideoChange} className="hidden" />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>URL do Vídeo</Label>
                  <Input
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="Ex: https://www.youtube.com/watch?v=... ou link direto do vídeo"
                    type="url"
                  />
                  <p className="text-xs text-muted-foreground">Cole o link do YouTube, Instagram, TikTok ou link direto do vídeo</p>
                </div>
              )}

              {inputMode === 'upload' && thumbnailPreview && (
                <div className="space-y-2">
                  <Label>Thumbnail gerada</Label>
                  <img src={thumbnailPreview} alt="Thumb" className="h-24 rounded-lg border border-border" />
                </div>
              )}
              <div className="flex gap-3">
                <Button type="submit" disabled={
                  (inputMode === 'upload' ? !videoFile : !videoUrl.trim()) || !name.trim() || isProcessing
                }>
                  {isProcessing ? 'Enviando...' : 'Salvar'}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {testimonials.length === 0 && !isAdding ? (
        <Card className="border-dashed border-2 border-border">
          <CardContent className="p-12 text-center">
            <Video className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Nenhum depoimento cadastrado</p>
            <Button variant="outline" className="mt-4" onClick={() => setIsAdding(true)}>Adicionar primeiro</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
          {testimonials.map((t) => (
            <Card key={t.id} className="border-border/50 overflow-hidden">
              <div className="relative aspect-[9/16] bg-muted">
                {t.thumbnail_url ? (
                  <img src={t.thumbnail_url} alt={t.name} className="w-full h-full object-cover" />
                ) : t.video_url ? (
                  <video
                    src={`${t.video_url}#t=0.5`}
                    className="w-full h-full object-cover"
                    muted
                    preload="metadata"
                    playsInline
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Video className="w-10 h-10 text-muted-foreground/30" />
                  </div>
                )}
                <Dialog>
                  <DialogTrigger asChild>
                    <button className="absolute inset-0 flex items-center justify-center bg-foreground/10 hover:bg-foreground/20 transition-colors">
                      <div className="w-10 h-10 rounded-full bg-card/90 flex items-center justify-center shadow-lg">
                        <Play className="w-4 h-4 text-foreground ml-0.5" />
                      </div>
                    </button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader><DialogTitle>Depoimento de {t.name}</DialogTitle></DialogHeader>
                    <video src={t.video_url} controls autoPlay className="w-full rounded-lg" />
                  </DialogContent>
                </Dialog>
              </div>
              <CardContent className="p-3 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-foreground text-sm truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString('pt-BR')}</p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive shrink-0 h-8 w-8">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir depoimento?</AlertDialogTitle>
                      <AlertDialogDescription>O depoimento de "{t.name}" será removido.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(t.id)}>Excluir</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default TestimonialList;
