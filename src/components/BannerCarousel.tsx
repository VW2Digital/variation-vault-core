import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchBannerSlides } from '@/lib/api';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimatePresence, motion } from 'framer-motion';

const BannerCarousel = () => {
  const [slides, setSlides] = useState<any[]>([]);
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBannerSlides(true)
      .then(setSlides)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(() => {
      setDirection(1);
      setCurrent(prev => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [slides.length]);

  const prev = useCallback(() => {
    setDirection(-1);
    setCurrent(c => (c - 1 + slides.length) % slides.length);
  }, [slides.length]);

  const next = useCallback(() => {
    setDirection(1);
    setCurrent(c => (c + 1) % slides.length);
  }, [slides.length]);

  if (loading || slides.length === 0) return null;

  const slide = slides[current];
  const linkTo = slide.product_id
    ? `/produto/${slide.product_id}`
    : slide.link_url || null;

  const variants = {
    enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? '-100%' : '100%', opacity: 0 }),
  };

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
      <div className="relative aspect-[16/5] sm:aspect-[16/6] md:aspect-[16/5]">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={current}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
            className="absolute inset-0"
          >
            {linkTo ? (
              <Link to={linkTo} className="block w-full h-full">
                <ImageContent />
              </Link>
            ) : (
              <ImageContent />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {slides.length > 1 && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/60 backdrop-blur-sm hover:bg-background/80 rounded-full h-8 w-8 md:h-10 md:w-10 z-10"
            onClick={prev}
          >
            <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/60 backdrop-blur-sm hover:bg-background/80 rounded-full h-8 w-8 md:h-10 md:w-10 z-10"
            onClick={next}
          >
            <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
          </Button>

          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => { setDirection(i > current ? 1 : -1); setCurrent(i); }}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === current
                    ? 'bg-primary w-5'
                    : 'bg-background/60 hover:bg-background/80 w-2'
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
