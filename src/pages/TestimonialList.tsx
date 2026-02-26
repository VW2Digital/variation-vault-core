import { useState, useRef } from 'react';
import { useTestimonials, VideoTestimonial } from '@/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Video, Upload, Play } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const TestimonialList = () => {
  const { testimonials, addTestimonial, deleteTestimonial } = useTestimonials();
  const { toast } = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState('');
  const [thumbnailPreview, setThumbnailPreview] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'O vídeo deve ter no máximo 50MB.', variant: 'destructive' });
      return;
    }
    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoPreview(url);

    // Generate thumbnail from video
    const video = document.createElement('video');
    video.src = url;
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.addEventListener('loadeddata', () => {
      video.currentTime = 1;
    });
    video.addEventListener('seeked', () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        setThumbnailPreview(canvas.toDataURL('image/jpeg', 0.8));
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoFile || !name.trim()) return;

    setIsProcessing(true);

    // Convert video to data URL for local storage
    const reader = new FileReader();
    reader.onload = () => {
      addTestimonial({
        name: name.trim(),
        videoUrl: reader.result as string,
        thumbnailUrl: thumbnailPreview,
      });
      toast({ title: 'Depoimento adicionado com sucesso!' });
      resetForm();
      setIsProcessing(false);
    };
    reader.readAsDataURL(videoFile);
  };

  const resetForm = () => {
    setName('');
    setVideoFile(null);
    setVideoPreview('');
    setThumbnailPreview('');
    setIsAdding(false);
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Depoimentos em Vídeo</h1>
        <Button onClick={() => setIsAdding(true)}>
          <Plus className="mr-2 h-4 w-4" /> Novo Depoimento
        </Button>
      </div>

      {/* Add Form */}
      {isAdding && (
        <Card className="border-primary/30 border-2">
          <CardHeader>
            <CardTitle className="text-lg">Adicionar Depoimento</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome do Cliente</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Maria Silva"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Vídeo (max 50MB)</Label>
                <div
                  onClick={() => videoInputRef.current?.click()}
                  className="border-2 border-dashed border-border hover:border-primary/50 rounded-xl p-8 text-center cursor-pointer transition-colors"
                >
                  {videoPreview ? (
                    <div className="space-y-3">
                      <video
                        src={videoPreview}
                        className="max-h-48 mx-auto rounded-lg"
                        controls
                      />
                      <p className="text-sm text-muted-foreground">{videoFile?.name}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="w-10 h-10 mx-auto text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">Clique para selecionar um vídeo</p>
                      <p className="text-xs text-muted-foreground/70">MP4, MOV, WebM</p>
                    </div>
                  )}
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleVideoChange}
                    className="hidden"
                  />
                </div>
              </div>
              {thumbnailPreview && (
                <div className="space-y-2">
                  <Label>Thumbnail gerada automaticamente</Label>
                  <img src={thumbnailPreview} alt="Thumbnail" className="h-24 rounded-lg border border-border" />
                </div>
              )}
              <div className="flex gap-3">
                <Button type="submit" disabled={!videoFile || !name.trim() || isProcessing}>
                  {isProcessing ? 'Processando...' : 'Salvar Depoimento'}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* List */}
      {testimonials.length === 0 && !isAdding ? (
        <Card className="border-dashed border-2 border-border">
          <CardContent className="p-12 text-center">
            <Video className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Nenhum depoimento em vídeo cadastrado</p>
            <Button variant="outline" className="mt-4" onClick={() => setIsAdding(true)}>
              Adicionar primeiro depoimento
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {testimonials.map((t) => (
            <Card key={t.id} className="border-border/50 overflow-hidden">
              <div className="relative aspect-[9/16] max-h-[300px] bg-muted">
                {t.thumbnailUrl ? (
                  <img src={t.thumbnailUrl} alt={t.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Video className="w-12 h-12 text-muted-foreground/30" />
                  </div>
                )}
                {/* Play preview dialog */}
                <Dialog>
                  <DialogTrigger asChild>
                    <button className="absolute inset-0 flex items-center justify-center bg-foreground/10 hover:bg-foreground/20 transition-colors">
                      <div className="w-12 h-12 rounded-full bg-card/90 flex items-center justify-center shadow-lg">
                        <Play className="w-5 h-5 text-foreground ml-0.5" />
                      </div>
                    </button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Depoimento de {t.name}</DialogTitle>
                    </DialogHeader>
                    <video src={t.videoUrl} controls autoPlay className="w-full rounded-lg" />
                  </DialogContent>
                </Dialog>
              </div>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(t.createdAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir depoimento?</AlertDialogTitle>
                      <AlertDialogDescription>
                        O depoimento de "{t.name}" será removido permanentemente.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteTestimonial(t.id)}>
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default TestimonialList;
