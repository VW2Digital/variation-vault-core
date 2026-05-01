import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton que reproduz exatamente o layout do card de produto do Catálogo
 * para evitar Cumulative Layout Shift (CLS) durante o carregamento.
 *
 * - Mesma aspect-ratio da imagem (1080/1450)
 * - Mesmo padding e gaps do card real
 * - Mesma altura do CTA
 */
export function ProductCardSkeleton() {
  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden flex flex-col h-full">
      {/* Image placeholder — mesma aspect-ratio do card real */}
      <div className="relative aspect-[1080/1450] bg-white border-b border-border/40 flex items-center justify-center p-[20px]">
        <Skeleton className="w-[78%] h-[78%] rounded-lg bg-muted/70" />
        {/* Badge placeholder (canto superior esquerdo) */}
        <Skeleton className="absolute top-2 left-2 h-5 w-12 rounded-md bg-muted/80" />
      </div>

      {/* Content placeholder */}
      <div className="p-3 pt-1.5 space-y-2 flex-1 flex flex-col">
        {/* Título (2 linhas) */}
        <Skeleton className="h-3.5 w-[90%] rounded" />
        <Skeleton className="h-3.5 w-[60%] rounded" />

        {/* Subtítulo */}
        <Skeleton className="h-2.5 w-[70%] rounded mt-0.5" />

        {/* Estrelas */}
        <div className="flex items-center gap-1 pt-0.5">
          <Skeleton className="h-3 w-16 rounded" />
        </div>

        {/* Preço */}
        <div className="pt-1 space-y-1">
          <Skeleton className="h-3 w-14 rounded" /> {/* preço riscado */}
          <Skeleton className="h-7 w-24 rounded" /> {/* preço grande */}
          <Skeleton className="h-2.5 w-20 rounded" /> {/* pix off */}
          <Skeleton className="hidden sm:block h-2.5 w-32 rounded" /> {/* parcelamento */}
        </div>

        <div className="flex-1" />
      </div>

      {/* CTA placeholder — mesma altura do botão real (h-9 sm:h-10) */}
      <div className="px-3 pb-3 pt-1 mt-auto">
        <Skeleton className="w-full h-9 sm:h-10 rounded-md" />
      </div>
    </div>
  );
}

/**
 * Grid completo de skeletons usando o mesmo grid do catálogo.
 */
export function ProductCardSkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1.5 sm:gap-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}