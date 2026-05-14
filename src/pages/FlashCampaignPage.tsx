import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Zap, Clock, Flame, ShieldCheck, Send } from 'lucide-react';

const formatPhone = (v: string) => {
  const digits = v.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

interface Campaign {
  id: string; slug: string; title: string; headline: string; subheadline: string;
  cta_text: string; payment_link_id: string; expires_at: string;
  starts_at: string | null;
  background_image: string | null; bg_color: string | null; accent_color: string | null; active: boolean;
  mode: string; capture_lead: boolean;
  lead_form_title: string | null; lead_form_subtitle: string | null; lead_cta_text: string | null;
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
  const { toast } = useToast();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [link, setLink] = useState<PaymentLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  // Lead form state
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadName, setLeadName] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [submittingLead, setSubmittingLead] = useState(false);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data: c } = await supabase.from('flash_campaigns' as any)
        .select('*').eq('slug', slug).eq('active', true).maybeSingle();
      if (!c) { setLoading(false); return; }
      const camp = c as unknown as Campaign;
      setCampaign(camp);
      if (camp.payment_link_id) {
        const { data: l } = await supabase.from('payment_links')
          .select('id,slug,amount,title').eq('id', camp.payment_link_id).maybeSingle();
        if (l) setLink(l as PaymentLink);
      }
      const { error: viewErr } = await supabase.from('flash_campaign_events' as any).insert({
        campaign_id: camp.id, event_type: 'view', session_id: getSessionId(),
      });
      if (viewErr) console.error('[flash] view insert error:', viewErr);
      setLoading(false);
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
    return {
      days: Math.floor(diff / 86400000),
      hours: Math.floor((diff % 86400000) / 3600000),
      minutes: Math.floor((diff % 3600000) / 60000),
      seconds: Math.floor((diff % 60000) / 1000),
    };
  }, [campaign, now]);

  const notStartedYet = useMemo(() => {
    if (!campaign?.starts_at) return null;
    const diff = new Date(campaign.starts_at).getTime() - now;
    if (diff <= 0) return null;
    return {
      days: Math.floor(diff / 86400000),
      hours: Math.floor((diff % 86400000) / 3600000),
      minutes: Math.floor((diff % 3600000) / 60000),
      seconds: Math.floor((diff % 60000) / 1000),
    };
  }, [campaign, now]);

  const isLeadOnly = campaign?.mode === 'lead';
  const needsLeadCapture = isLeadOnly || !!campaign?.capture_lead;

  const onCta = async () => {
    if (!campaign) return;
    if (needsLeadCapture) {
      setShowLeadForm(true);
      setTimeout(() => document.getElementById('lead-form')?.scrollIntoView({ behavior: 'smooth' }), 50);
      return;
    }
    await goToCheckout();
  };

  const goToCheckout = async () => {
    if (!campaign || !link) return;
    await supabase.from('flash_campaign_events' as any).insert({
      campaign_id: campaign.id, event_type: 'click', session_id: getSessionId(),
    });
    sessionStorage.setItem('flash_campaign_pending', JSON.stringify({
      campaign_id: campaign.id, slug: campaign.slug, ts: Date.now(),
    }));
    navigate(`/pagar/${link.slug}`);
  };

  const submitLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaign) return;
    if (!leadName.trim() || !leadEmail.trim() || !leadPhone.trim()) {
      toast({ title: 'Preencha todos os campos', variant: 'destructive' });
      return;
    }
    setSubmittingLead(true);
    const { error } = await supabase.from('flash_campaign_leads' as any).insert({
      campaign_id: campaign.id,
      name: leadName.trim(),
      email: leadEmail.trim().toLowerCase(),
      phone: leadPhone.trim(),
      session_id: getSessionId(),
      user_agent: navigator.userAgent,
      source_url: window.location.href,
    });
    setSubmittingLead(false);
    if (error) {
      toast({ title: 'Erro ao enviar', description: error.message, variant: 'destructive' });
      return;
    }
    sessionStorage.setItem(`flash_lead_${campaign.id}`, JSON.stringify({
      name: leadName.trim(), email: leadEmail.trim(), phone: leadPhone.trim(),
    }));
    if (isLeadOnly) {
      navigate(`/relampago/${campaign.slug}/obrigado`);
    } else {
      await goToCheckout();
    }
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
  const scheduled = !!notStartedYet;

  return (
    <div
      className="min-h-screen text-white relative overflow-hidden"
      style={{
        background: campaign.background_image
          ? `linear-gradient(rgba(0,0,0,0.75), rgba(0,0,0,0.85)), url(${campaign.background_image}) center/cover`
          : `radial-gradient(ellipse at top, ${accent}33, transparent 60%), ${bg}`,
      }}
    >
      <div className="w-full py-2 text-center text-xs font-bold tracking-wider animate-pulse" style={{ background: accent }}>
        <Flame className="w-4 h-4 inline mr-1" /> {isLeadOnly ? 'INSCRIÇÕES ABERTAS' : 'OFERTA RELÂMPAGO ATIVA'}
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

        {scheduled ? (
          <div className="mb-8">
            <div className="flex items-center justify-center gap-2 mb-3 text-sm font-bold uppercase tracking-widest" style={{ color: accent }}>
              <Clock className="w-4 h-4 animate-pulse" /> Começa em
            </div>
            <div className="flex justify-center gap-2 md:gap-4">
              {[
                { v: notStartedYet!.days, l: 'dias' },
                { v: notStartedYet!.hours, l: 'horas' },
                { v: notStartedYet!.minutes, l: 'min' },
                { v: notStartedYet!.seconds, l: 'seg' },
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
          </div>
        ) : expired ? (
          <div className="mb-8 p-6 rounded-2xl border border-white/20 bg-white/5">
            <p className="text-2xl font-bold text-white/70">Esta {isLeadOnly ? 'inscrição' : 'oferta'} expirou.</p>
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
          </div>
        )}

        {!isLeadOnly && link && (
          <div className="mb-6">
            <div className="text-sm text-white/60 uppercase tracking-wider mb-1">Por apenas</div>
            <div className="text-5xl md:text-7xl font-black mb-6" style={{ color: accent }}>
              {Number(link.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </div>
          </div>
        )}

        {!showLeadForm && (
          <Button
            size="lg"
            disabled={expired || scheduled || (!isLeadOnly && !link)}
            onClick={onCta}
            className="text-base md:text-xl font-black uppercase px-8 md:px-14 py-6 md:py-8 rounded-xl shadow-2xl hover:scale-105 transition-transform animate-pulse"
            style={{ background: accent, color: '#000', boxShadow: `0 10px 40px ${accent}80` }}
          >
            <Flame className="w-5 h-5 md:w-6 md:h-6 mr-2" />
            {campaign.cta_text}
          </Button>
        )}

        {showLeadForm && !expired && !scheduled && (
          <form id="lead-form" onSubmit={submitLead}
                className="max-w-md mx-auto rounded-2xl border backdrop-blur-md p-6 md:p-8 space-y-4 text-left"
                style={{ background: 'rgba(255,255,255,0.06)', borderColor: `${accent}66` }}>
            <div className="text-center">
              <h3 className="text-2xl font-bold mb-1">{campaign.lead_form_title || 'Garanta sua vaga'}</h3>
              <p className="text-sm text-white/70">{campaign.lead_form_subtitle || 'Preencha seus dados para continuar'}</p>
            </div>
            <div>
              <Label className="text-white/80">Nome completo</Label>
              <Input value={leadName} onChange={e => setLeadName(e.target.value)}
                     className="bg-white/10 border-white/20 text-white placeholder:text-white/40" placeholder="Seu nome" required />
            </div>
            <div>
              <Label className="text-white/80">Email</Label>
              <Input type="email" value={leadEmail} onChange={e => setLeadEmail(e.target.value)}
                     className="bg-white/10 border-white/20 text-white placeholder:text-white/40" placeholder="voce@email.com" required />
            </div>
            <div>
              <Label className="text-white/80">WhatsApp</Label>
              <Input value={leadPhone} onChange={e => setLeadPhone(formatPhone(e.target.value))}
                     inputMode="tel" maxLength={15}
                     className="bg-white/10 border-white/20 text-white placeholder:text-white/40" placeholder="(11) 99999-9999" required />
            </div>
            <Button type="submit" size="lg" disabled={submittingLead}
                    className="w-full text-base font-black uppercase rounded-xl"
                    style={{ background: accent, color: '#000' }}>
              <Send className="w-4 h-4 mr-2" />
              {submittingLead ? 'Enviando...' : (campaign.lead_cta_text || (isLeadOnly ? 'QUERO ME INSCREVER' : 'CONTINUAR'))}
            </Button>
          </form>
        )}

        <div className="mt-8 flex items-center justify-center gap-4 text-xs text-white/50">
          <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> {isLeadOnly ? 'Seus dados estão seguros' : 'Pagamento seguro'}</span>
          {!isLeadOnly && <><span>·</span><span>Estoque limitado</span></>}
        </div>
      </div>
    </div>
  );
}
