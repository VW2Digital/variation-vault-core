import { useState, useCallback, useEffect, useRef, MouseEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import productHeroImg from '@/assets/product-hero.png';

interface ProductCardImageCarouselProps {
  images: string[];
  alt: string;
  imgClassName?: string;
  imageInset?: string;
  autoplayMs?: number;
  fadeMs?: number;
}

export default function ProductCardImageCarousel({
  images,
  alt,
  imgClassName = '',
  imageInset = '0%',
  autoplayMs = 3500,
  fadeMs = 700,
}: ProductCardImageCarouselProps) {
  const list = images && images.length > 0 ? images : [productHeroImg];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const interactedRef = useRef(false);
  const hasMultiple = list.length > 1;

  const stop = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const prev = useCallback((e: MouseEvent) => {
    stop(e);
    interactedRef.current = true;
    setIndex((i) => (i - 1 + list.length) % list.length);
  }, [list.length]);

  const next = useCallback((e: MouseEvent) => {
    stop(e);
    interactedRef.current = true;
    setIndex((i) => (i + 1) % list.length);
  }, [list.length]);

  const goTo = (e: MouseEvent, i: number) => {
    stop(e);
    interactedRef.current = true;
    setIndex(i);
  };

  useEffect(() => {
    if (!hasMultiple || paused || autoplayMs <= 0) return;
    const id = window.setInterval(() => {
      if (interactedRef.current) {
        interactedRef.current = false;
        return;
      }
      setIndex((i) => (i + 1) % list.length);
    }, autoplayMs);
    return () => window.clearInterval(id);
  }, [hasMultiple, paused, autoplayMs, list.length]);

  return (
    <div
      className="absolute inset-0"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="absolute overflow-hidden" style={{ inset: imageInset }}>
        {list.map((src, i) => (
          <img
            key={i}
            src={src}
            alt={i === index ? alt : ''}
            aria-hidden={i !== index}
            loading={i === 0 ? 'eager' : 'lazy'}
            decoding="async"
            width={1080}
            height={1450}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = productHeroImg;
            }}
            style={{
              opacity: i === index ? 1 : 0,
              transitionDuration: `${fadeMs}ms`,
            }}
            className={`${imgClassName} absolute inset-0 m-auto transition-opacity ease-in-out ${
              i === index ? 'z-[1]' : 'z-0 pointer-events-none'
            }`}
          />
        ))}
      </div>

      {hasMultiple && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="Imagem anterior"
            className="absolute left-1.5 top-1/2 -translate-y-1/2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/90 hover:bg-white text-foreground shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Próxima imagem"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/90 hover:bg-white text-foreground shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1 z-20">
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
    </div>
  );
}
