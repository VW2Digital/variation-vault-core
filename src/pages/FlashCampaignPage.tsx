import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Zap, Clock, Flame, ShieldCheck } from 'lucide-react';

interface Campaign {
  id: string; slug: string; title: string; headline: string; subheadline: string;
  cta_text: string; payment_link_id: string; expires_at: string;
  background_image: string | null; bg_color: string | null; accent_color: string | null; active: boolean;
}
interface PaymentLink { id: string; slug: string; amount: number; title: string; }

const SESSION_KEY = 'flash_session_id';
const getSessionId = () => {
  let s = sessionStorage.getItem(SESSION_KEY);
  if (!s) { s = crypto.randomUUID(); sessionStorage.setItem(SESSION_KEY, s); }
  return s;
};

export default function FlashCampaignPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [link, setLink] = useState<PaymentLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data: c } = await supabase.from('flash_campaigns' as any)
        .select('*').eq('slug', slug).eq('active', true).maybeSingle();
      if (!c) { setLoading(false); return; }
      const camp = c as unknown as Campaign;
      setCampaign(camp);
      const { data: l } = await supabase.from('payment_links')
        .select('id,slug,amount,title').eq('id', camp.payment_link_id).maybeSingle();
      if (l) setLink(l as PaymentLink);
      setLoading(false);
      // registrar view
      supabase.from('flash_campaign_events' as any).insert({
        campaign_id: camp.id, event_type: 'view', session_id: getSessionId(),
      });
    })();
  }, [slug]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = useMemo(() => {
    if (!campaign) return null;
    const diff = new Date(campaign.expires_at).getTime() - now;
    if (diff <= 0) return null;
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return { days, hours, minutes, seconds };
  }, [campaign, now]);

  const onCta = async () => {
    if (!campaign || !link) return;
    await supabase.from('flash_campaign_events' as any).insert({
      campaign_id: campaign.id, event_type: 'click', session_id: getSessionId(),
    });
    // marcar campanha pendente para o checkout vincular o pedido
    sessionStorage.setItem('flash_campaign_pending', JSON.stringify({
      campaign_id: campaign.id, ts: Date.now(),
    }));
    navigate(`/pagar/${link.slug}`);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-black text-white">Carregando...</div>;
  }
  if (!campaign) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white p-6 text-center">
        <div>
          <h1 className="text-2xl font-bold mb-2">Campanha não encontrada</h1>
          <p className="text-white/70">Esta oferta pode ter expirado ou foi desativada.</p>
        </div>
      </div>
    );
  }

  const accent = campaign.accent_color || '#ef4444';
  const bg = campaign.bg_color || '#0a0000';
  const expired = !remaining;

  return (
    <div
      className="min-h-screen text-white relative overflow-hidden"
      style={{
        background: campaign.background_image
          ? `linear-gradient(rgba(0,0,0,0.75), rgba(0,0,0,0.85)), url(${campaign.background_image}) center/cover`
          : `radial-gradient(ellipse at top, ${accent}33, transparent 60%), ${bg}`,
      }}
    >
      {/* Faixa topo */}
      <div className="w-full py-2 text-center text-xs font-bold tracking-wider animate-pulse" style={{ background: accent }}>
        <Flame className="w-4 h-4 inline mr-1" /> OFERTA RELÂMPAGO ATIVA
      </div>

      <div className="max-w-3xl mx-auto px-6 py-12 md:py-20 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-6"
             style={{ background: `${accent}33`, color: accent, border: `1px solid ${accent}` }}>
          <Zap className="w-3.5 h-3.5" /> {campaign.title}
        </div>

        <h1 className="text-4xl md:text-6xl font-black uppercase leading-tight mb-4 drop-shadow-lg"
            style={{ textShadow: `0 0 30px ${accent}80` }}>
          {campaign.headline}
        </h1>
        <p className="text-lg md:text-xl text-white/80 mb-10 max-w-2xl mx-auto">
          {campaign.subheadline}
        </p>

        {/* Cronômetro */}
        {expired ? (
          <div className="mb-8 p-6 rounded-2xl border border-white/20 bg-white/5">
            <p className="text-2xl font-bold text-white/70">Esta oferta expirou.</p>
          </div>
        ) : (
          <div className="mb-8">
            <div className="flex items-center justify-center gap-2 mb-3 text-sm font-bold uppercase tracking-widest" style={{ color: accent }}>
              <Clock className="w-4 h-4 animate-pulse" /> Termina em
            </div>
            <div className="flex justify-center gap-2 md:gap-4">
              {[
                { v: remaining!.days, l: 'dias' },
                { v: remaining!.hours, l: 'horas' },
                { v: remaining!.minutes, l: 'min' },
                { v: remaining!.seconds, l: 'seg' },
              ].map((u, i) => (
                <div key={i} className="rounded-xl px-4 py-3 md:px-6 md:py-4 min-w-[70px] md:min-w-[90px] backdrop-blur-sm border"
                     style={{ background: `${accent}1f`, borderColor: `${accent}66` }}>
                  <div className="text-3xl md:text-5xl font-black font-mono leading-none" style={{ color: accent }}>
                    {String(u.v).padStart(2, '0')}
                  </div>
                  <div className="text-[10px] md:text-xs uppercase mt-1 text-white/60">{u.l}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-white/50 mt-3">
              Validade: {new Date(campaign.expires_at).toLocaleString('pt-BR')}
            </p>
          </div>
        )}

        {/* Preço/CTA */}
        {link && (
          <div className="mb-6">
            <div className="text-sm text-white/60 uppercase tracking-wider mb-1">Por apenas</div>
            <div className="text-5xl md:text-7xl font-black mb-6" style={{ color: accent }}>
              {Number(link.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </div>
          </div>
        )}

        <Button
          size="lg"
          disabled={expired || !link}
          onClick={onCta}
          className="text-base md:text-xl font-black uppercase px-8 md:px-14 py-6 md:py-8 rounded-xl shadow-2xl hover:scale-105 transition-transform animate-pulse"
          style={{ background: accent, color: '#000', boxShadow: `0 10px 40px ${accent}80` }}
        >
          <Flame className="w-5 h-5 md:w-6 md:h-6 mr-2" />
          {campaign.cta_text}
        </Button>

        <div className="mt-8 flex items-center justify-center gap-4 text-xs text-white/50">
          <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Pagamento seguro</span>
          <span>·</span>
          <span>Estoque limitado</span>
        </div>
      </div>
    </div>
  );
}