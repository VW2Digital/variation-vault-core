import { useEffect, useMemo, useState } from "react";
import { useLocation, Link } from "react-router-dom";
import { X, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchSetting } from "@/lib/api";

interface OfferItem {
  id: string;
  product_id: string;
  product_name: string;
  product_slug?: string;
  dosage: string;
  image_url: string;
  price: number;
  offer_price: number;
  discount: number;
}

interface WidgetConfig {
  enabled: boolean;
  expires_at: string; // ISO
  title: string;
}

const STORAGE_KEY = "flash_offers_widget_closed_until";

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const pad = (n: number) => String(n).padStart(2, "0");

function useCountdown(target: Date | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  if (!target) return null;
  const diff = Math.max(0, target.getTime() - now);
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  return { h, m, s, ended: diff === 0 };
}

const FlashOffersWidget = () => {
  const location = useLocation();
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [items, setItems] = useState<OfferItem[]>([]);
  const [closed, setClosed] = useState(false);

  const onCatalog = location.pathname === "/" || location.pathname === "/catalogo";

  useEffect(() => {
    const until = Number(sessionStorage.getItem(STORAGE_KEY) || 0);
    if (until && until > Date.now()) setClosed(true);
  }, []);

  useEffect(() => {
    if (!onCatalog) return;
    (async () => {
      try {
        const raw = await fetchSetting("flash_offers_widget");
        if (!raw) return;
        const cfg: WidgetConfig = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!cfg?.enabled) return;
        setConfig(cfg);

        const { data: variations } = await supabase
          .from("product_variations")
          .select("id, product_id, dosage, image_url, price, offer_price, is_offer, products(name, active, images)")
          .eq("is_offer", true)
          .gt("offer_price", 0)
          .limit(20);

        const offers: OfferItem[] = (variations || [])
          .filter((v: any) => v.products?.active && v.offer_price < v.price)
          .map((v: any) => ({
            id: v.id,
            product_id: v.product_id,
            product_name: v.products?.name || "",
            dosage: v.dosage,
            image_url: v.image_url || v.products?.images?.[0] || "/placeholder.svg",
            price: Number(v.price),
            offer_price: Number(v.offer_price),
            discount: Math.round(((v.price - v.offer_price) / v.price) * 100),
          }))
          .slice(0, 3);
        setItems(offers);
      } catch (e) {
        console.error("FlashOffersWidget load error", e);
      }
    })();
  }, [onCatalog]);

  const target = useMemo(
    () => (config?.expires_at ? new Date(config.expires_at) : null),
    [config?.expires_at],
  );
  const countdown = useCountdown(target);

  if (!onCatalog || !config?.enabled || closed || items.length === 0) return null;
  if (countdown?.ended) return null;

  const close = () => {
    sessionStorage.setItem(STORAGE_KEY, String(Date.now() + 60 * 60 * 1000));
    setClosed(true);
  };

  return (
    <div className="fixed z-40 bottom-20 right-3 sm:bottom-6 sm:right-6 w-[240px] rounded-2xl bg-[#e7f8ff] shadow-2xl border border-cyan-200/60 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
            <h3 className="text-[13px] font-extrabold text-cyan-900 tracking-tight uppercase leading-none">
              {config.title || "Ofertas Relâmpago"}
            </h3>
          </div>
          <button
            onClick={close}
            aria-label="Fechar"
            className="text-cyan-900/60 hover:text-cyan-900 -mt-1 -mr-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {countdown && (
          <div className="mt-1 flex items-center gap-1 text-[11px] text-cyan-900">
            <span>Encerram em</span>
            <span className="font-mono font-bold bg-white/70 px-1 py-0.5 rounded">{pad(countdown.h)}</span>
            <span className="font-bold">:</span>
            <span className="font-mono font-bold bg-white/70 px-1 py-0.5 rounded">{pad(countdown.m)}</span>
            <span className="font-bold">:</span>
            <span className="font-mono font-bold bg-white/70 px-1 py-0.5 rounded">{pad(countdown.s)}</span>
          </div>
        )}
      </div>

      <div className="px-2 pb-2 space-y-2">
        {items.map((item) => (
          <Link
            key={item.id}
            to={`/produto/${item.product_id}?variation=${item.id}`}
            className="flex items-center gap-2 bg-white rounded-xl p-2 shadow-sm hover:shadow-md transition-shadow"
          >
            <img
              src={item.image_url}
              alt={item.product_name}
              className="w-12 h-12 object-contain rounded-lg bg-muted/30 shrink-0"
              loading="lazy"
            />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-muted-foreground line-through leading-tight">
                {formatBRL(item.price)}
              </p>
              <p className="text-[14px] font-extrabold text-foreground leading-tight">
                {formatBRL(item.offer_price)}
              </p>
              <p className="text-[10px] font-bold text-emerald-600 leading-tight">
                {item.discount}% OFF
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default FlashOffersWidget;