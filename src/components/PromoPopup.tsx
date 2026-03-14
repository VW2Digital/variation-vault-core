import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X } from 'lucide-react';

interface PopupData {
  id: string;
  title: string;
  image_url: string;
  product_id: string | null;
  active: boolean;
  expires_at: string | null;
}

const PromoPopup = () => {
  const navigate = useNavigate();
  const [popup, setPopup] = useState<PopupData | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fetchPopup = async () => {
      const now = new Date().toISOString();
      const { data } = await supabase
        .from('popups')
        .select('id, title, image_url, product_id, active, expires_at')
        .eq('active', true)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order('created_at', { ascending: false })
        .limit(1);

      const popups = (data as PopupData[] | null) || [];
      if (popups.length > 0) {
        // Check if user already dismissed this popup in this session
        const dismissedId = sessionStorage.getItem('dismissed_popup');
        if (dismissedId !== popups[0].id) {
          setPopup(popups[0]);
          setOpen(true);
        }
      }
    };

    // Small delay so page loads first
    const timer = setTimeout(fetchPopup, 800);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setOpen(false);
    if (popup) {
      sessionStorage.setItem('dismissed_popup', popup.id);
    }
  };

  const handleClick = () => {
    if (popup?.product_id) {
      navigate(`/produto/${popup.product_id}`);
    }
    handleClose();
  };

  if (!popup) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DialogContent className="p-0 border-0 bg-transparent shadow-none max-w-md sm:max-w-lg [&>button]:hidden">
        <div className="relative">
          <button
            onClick={handleClose}
            className="absolute -top-3 -right-3 z-10 w-8 h-8 rounded-full bg-foreground/80 text-background flex items-center justify-center hover:bg-foreground transition-colors shadow-lg"
          >
            <X className="w-4 h-4" />
          </button>
          <img
            src={popup.image_url}
            alt={popup.title}
            onClick={handleClick}
            className={`w-full rounded-xl shadow-2xl ${popup.product_id ? 'cursor-pointer hover:opacity-95 transition-opacity' : ''}`}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PromoPopup;
