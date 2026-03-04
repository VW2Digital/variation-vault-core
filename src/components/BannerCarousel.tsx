import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchBannerSlides } from '@/lib/api';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const BannerCarousel = () => {
  const [slides, setSlides] = useState<any[]>([]);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBannerSlides(true)
      .then(setSlides)
      .finally(() => setLoading(false));
  }, []);

  // Auto-advance
  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(() => {
      setCurrent(prev => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [slides.length]);

  const prev = useCallback(() => {
    setCurrent(c => (c - 1 + slides.length) % slides.length);
  }, [slides.length]);

  const next = useCallback(() => {
    setCurrent(c => (c + 1) % slides.length);
  }, [slides.length]);

  if (loading || slides.length === 0) return null;

  const slide = slides[current];
  const linkTo = slide.product_id
    ? `/produto/${slide.product_id}`
    : slide.link_url || null;

  const ImageContent = () => (
    <picture>
      {slide.image_mobile && (
        <source media="(max-width: 639px)" srcSet={slide.image_mobile} />
      )}
      {slide.image_tablet && (
        <source media="(max-width: 1023px)" srcSet={slide.image_tablet} />
      )}
      <img
        src={slide.image_desktop || slide.image_tablet || slide.image_mobile}
        alt={slide.title || 'Banner'}
        className="w-full h-full object-cover"
      />
    </picture>
  );

  return (
    <div className="relative w-full overflow-hidden bg-muted/30">
      {/* Slide */}
      <div className="relative aspect-[16/5] sm:aspect-[16/6] md:aspect-[16/5]">
        {linkTo ? (
          <Link to={linkTo} className="block w-full h-full">
            <ImageContent />
          </Link>
        ) : (
          <ImageContent />
        )}
      </div>

      {/* Navigation arrows */}
      {slides.length > 1 && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/60 backdrop-blur-sm hover:bg-background/80 rounded-full h-8 w-8 md:h-10 md:w-10"
            onClick={prev}
          >
            <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/60 backdrop-blur-sm hover:bg-background/80 rounded-full h-8 w-8 md:h-10 md:w-10"
            onClick={next}
          >
            <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
          </Button>

          {/* Dots */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === current
                    ? 'bg-primary w-5'
                    : 'bg-background/60 hover:bg-background/80'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default BannerCarousel;
