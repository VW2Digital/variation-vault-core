import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Download, Link2, ExternalLink, Mail, Phone, Gift, Star, Heart, Send, MessageSquare } from 'lucide-react';
import { FaWhatsapp, FaTelegram, FaInstagram, FaFacebook, FaYoutube, FaTiktok } from 'react-icons/fa';

interface ThankYouButton {
  label: string;
  url: string;
  color?: string;
  icon?: string;
  new_tab?: boolean;
}
interface Campaign {
  id: string; slug: string; title: string; mode: string;
  thank_you_headline: string | null;
  thank_you_message: string | null;
  thank_you_bg_color: string | null;
  thank_you_accent_color: string | null;
  thank_you_buttons: ThankYouButton[] | null;
  bg_color: string | null;
  accent_color: string | null;
  background_image: string | null;
}

const ICONS: Record<string, any> = {
  whatsapp: FaWhatsapp,
  telegram: FaTelegram,
  instagram: FaInstagram,
  facebook: FaFacebook,
  youtube: FaYoutube,
  tiktok: FaTiktok,
  message: MessageSquare,
  download: Download,
  link: Link2,
  external: ExternalLink,
  mail: Mail,
  phone: Phone,
  gift: Gift,
  star: Star,
  heart: Heart,
  send: Send,
  check: CheckCircle2,
};

export default function FlashCampaignThankYouPage() {
  const { slug } = useParams<{ slug: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data } = await supabase.from('flash_campaigns' as any)
        .select('id,slug,title,mode,thank_you_headline,thank_you_message,thank_you_bg_color,thank_you_accent_color,thank_you_buttons,bg_color,accent_color,background_image')
        .eq('slug', slug).maybeSingle();
      setCampaign(data as unknown as Campaign);
      setLoading(false);
    })();
  }, [slug]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-black text-white">Carregando...</div>;
  }
  if (!campaign) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white p-6 text-center">
        <div>
          <h1 className="text-2xl font-bold mb-2">Página não encontrada</h1>
          <Link to="/" className="underline text-white/70">Voltar ao início</Link>
        </div>
      </div>
    );
  }

  const accent = campaign.thank_you_accent_color || campaign.accent_color || '#22c55e';
  const bg = campaign.thank_you_bg_color || campaign.bg_color || '#0a0000';
  const headline = campaign.thank_you_headline || (campaign.mode === 'lead' ? 'Inscrição confirmada!' : 'Obrigado pela sua compra!');
  const message = campaign.thank_you_message || 'Em instantes você receberá mais informações pelo seu email e WhatsApp.';
  const buttons: ThankYouButton[] = Array.isArray(campaign.thank_you_buttons) ? campaign.thank_you_buttons : [];

  return (
    <div
      className="min-h-screen text-white relative"
      style={{
        background: campaign.background_image
          ? `linear-gradient(rgba(0,0,0,0.85), rgba(0,0,0,0.9)), url(${campaign.background_image}) center/cover`
          : `radial-gradient(ellipse at top, ${accent}33, transparent 60%), ${bg}`,
      }}
    >
      <div className="max-w-2xl mx-auto px-6 py-16 md:py-24 text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center" style={{ background: `${accent}22`, border: `2px solid ${accent}` }}>
          <CheckCircle2 className="w-10 h-10" style={{ color: accent }} />
        </div>

        <h1 className="text-3xl md:text-5xl font-black mb-4 leading-tight" style={{ textShadow: `0 0 30px ${accent}80` }}>
          {headline}
        </h1>
        <p className="text-base md:text-lg text-white/80 mb-10 whitespace-pre-line">
          {message}
        </p>

        {buttons.length > 0 && (
          <div className="flex flex-col gap-3 max-w-md mx-auto">
            {buttons.map((b, i) => {
              const Icon = b.icon ? ICONS[b.icon] : null;
              const color = b.color || accent;
              return (
                <a
                  key={i}
                  href={b.url}
                  target={b.new_tab ? '_blank' : undefined}
                  rel={b.new_tab ? 'noopener noreferrer' : undefined}
                  className="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-bold uppercase text-sm md:text-base transition-transform hover:scale-105 shadow-xl"
                  style={{ background: color, color: '#000', boxShadow: `0 8px 24px ${color}60` }}
                >
                  {Icon && <Icon className="w-5 h-5" />}
                  {b.label}
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
