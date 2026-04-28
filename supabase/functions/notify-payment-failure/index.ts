// Notificação de falha de pagamento: WhatsApp + Email para admin.
// Email é enviado via Edge Function `send-email` (SMTP Hostinger).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { customerName, customerEmail, customerPhone, paymentMethod, errorMessage, productName, totalValue } = await req.json();

    const { data: settings } = await supabase
      .from("site_settings")
      .select("key, value")
      .in("key", [
        "evolution_api_url", "evolution_api_key", "evolution_instance_name",
        "whatsapp_number", "admin_notification_email", "smtp_from_email",
        "store_name", "support_whatsapp_number",
      ]);
    const cfg: Record<string, string> = {};
    for (const s of settings || []) cfg[s.key] = s.value;

    const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const valueFormatted = Number(totalValue || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const method = paymentMethod === "credit_card" ? "Cartão de Crédito" : "PIX";

    const results: Record<string, any> = {};

    // ── WhatsApp notification ──
    const apiUrl = cfg["evolution_api_url"];
    const apiKey = cfg["evolution_api_key"];
    const instanceName = cfg["evolution_instance_name"];
    const adminWhatsapp = cfg["whatsapp_number"];
    const storeName = cfg["store_name"] || "nossa loja";
    const supportWhatsapp = cfg["support_whatsapp_number"] || adminWhatsapp;

    // Helper: normaliza telefone BR para o formato esperado pela Evolution
    // (DDI 55 + DDD + número, somente dígitos).
    const normalizeBrPhone = (raw: string): string | null => {
      if (!raw) return null;
      let d = raw.replace(/\D/g, "");
      if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;
      if (d.length === 10 || d.length === 11) return "55" + d;
      return null;
    };

    const baseUrl = apiUrl ? apiUrl.replace(/\/+$/, "") : "";
    const evolutionReady = !!(apiUrl && apiKey && instanceName);

    // ── WhatsApp para o CLIENTE (mensagem amigável + motivo) ──
    const customerPhoneNormalized = normalizeBrPhone(customerPhone || "");
    if (evolutionReady && customerPhoneNormalized) {
      try {
        const friendlyName = (customerName || "").split(" ")[0] || "Olá";
        const reason = errorMessage || "Não conseguimos identificar o motivo exato.";
        const supportLine = supportWhatsapp
          ? `\nPrecisa de ajuda? Fale com a gente: https://wa.me/${normalizeBrPhone(supportWhatsapp) || supportWhatsapp.replace(/\D/g, "")}`
          : "";

        const customerText = [
          `Olá, ${friendlyName}!`,
          ``,
          `Tentamos processar o seu pagamento aqui na *${storeName}*, mas ele *não foi aprovado*. Não se preocupe — *nenhum valor foi cobrado* do seu cartão.`,
          ``,
          `*Pedido:* ${productName || "—"}`,
          `*Valor:* ${valueFormatted}`,
          `*Forma de pagamento:* ${method}`,
          ``,
          `*Motivo informado pelo banco/operadora:*`,
          `${reason}`,
          ``,
          `*O que você pode fazer agora:*`,
          `1) Conferir os dados do cartão (número, validade e CVV).`,
          `2) Tentar novamente com outro cartão.`,
          `3) Pagar via *PIX* — é instantâneo, sem limite de cartão e libera o pedido na hora.`,
          `4) Ligar para o telefone no verso do seu cartão e autorizar a compra com o seu banco.`,
          ``,
          `Seu carrinho continua salvo. É só voltar à loja e finalizar quando quiser.${supportLine}`,
        ].join("\n");

        const res = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": apiKey },
          body: JSON.stringify({ number: customerPhoneNormalized, text: customerText }),
        });
        results.whatsapp_customer = res.ok ? "sent" : `error:${res.status}`;
      } catch (e: any) {
        results.whatsapp_customer = `error:${e.message}`;
      }
    } else if (!customerPhoneNormalized) {
      results.whatsapp_customer = "skipped:invalid_phone";
    }

    // ── WhatsApp para o ADMIN ──
    if (evolutionReady && adminWhatsapp) {
      try {
        const whatsappText = [
          `*Falha no Pagamento*`,
          ``,
          `*Cliente:* ${customerName || "N/A"}`,
          `*Email:* ${customerEmail || "N/A"}`,
          `*Telefone:* ${customerPhone || "N/A"}`,
          ``,
          `*Produto:* ${productName || "N/A"}`,
          `*Valor:* ${valueFormatted}`,
          `*Método:* ${method}`,
          ``,
          `*Erro:* ${errorMessage || "Desconhecido"}`,
          `*Horário:* ${now}`,
        ].join("\n");

        const res = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": apiKey },
          body: JSON.stringify({ number: adminWhatsapp.replace(/\D/g, ""), text: whatsappText }),
        });
        results.whatsapp = res.ok ? "sent" : `error:${res.status}`;
      } catch (e: any) {
        results.whatsapp = `error:${e.message}`;
      }
    }

    // ── Email notification (delegated to send-email / SMTP) ──
    const adminEmail = cfg["admin_notification_email"] || cfg["smtp_from_email"];
    if (adminEmail) {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            template: "admin_notification",
            to: adminEmail,
            subject: `Falha Pagamento - ${customerName || "Cliente"} - ${valueFormatted}`,
            data: {
              event: "Falha no Pagamento",
              message: `Falha ao processar pagamento de ${customerName || "cliente"}.`,
              details: {
                cliente: customerName || "N/A",
                email: customerEmail || "N/A",
                telefone: customerPhone || "N/A",
                produto: productName || "N/A",
                valor: valueFormatted,
                metodo: method,
                erro: errorMessage || "Desconhecido",
                horario: now,
              },
            },
          }),
        });
        results.email = res.ok ? "sent" : `error:${res.status}`;
      } catch (e: any) {
        results.email = `error:${e.message}`;
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Notification error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
