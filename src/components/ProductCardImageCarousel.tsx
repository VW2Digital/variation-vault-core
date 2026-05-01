import { useState, useCallback, MouseEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import productHeroImg from '@/assets/product-hero.png';

interface ProductCardImageCarouselProps {
  images: string[];
  alt: string;
  imgClassName?: string;
}

export default function ProductCardImageCarousel({ images, alt, imgClassName = '' }: ProductCardImageCarouselProps) {
  const list = images && images.length > 0 ? images : [productHeroImg];
  const [index, setIndex] = useState(0);
  const hasMultiple = list.length > 1;

  const stop = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const prev = useCallback((e: MouseEvent) => {
    stop(e);
    setIndex((i) => (i - 1 + list.length) % list.length);
  }, [list.length]);

  const next = useCallback((e: MouseEvent) => {
    stop(e);
    setIndex((i) => (i + 1) % list.length);
  }, [list.length]);

  const goTo = (e: MouseEvent, i: number) => {
    stop(e);
    setIndex(i);
  };

  return (
    <>
      <img
        src={list[index]}
        alt={alt}
        loading="lazy"
        decoding="async"
        width={1080}
        height={1450}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).src = productHeroImg;
        }}
        className={imgClassName}
      />

      {hasMultiple && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="Imagem anterior"
            className="absolute left-1.5 top-1/2 -translate-y-1/2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/90 hover:bg-white text-foreground shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Próxima imagem"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/90 hover:bg-white text-foreground shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1 z-10">
            {list.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => goTo(e, i)}
                aria-label={`Ir para imagem ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'w-4 bg-primary' : 'w-1.5 bg-foreground/30 hover:bg-foreground/50'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}
