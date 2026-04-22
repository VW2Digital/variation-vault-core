import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // GET request = health check / webhook validation
  if (req.method === "GET") {
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const __startTs = Date.now();
  const __logCtx: any = {
    gateway: 'melhor-envio', event_type: null, http_status: 200,
    signature_valid: null, signature_error: null, order_id: null,
    external_id: null, error_message: null, request_payload: null,
  };
  let __logged = false;
  const __writeLog = async () => {
    if (__logged) return;
    __logged = true;
    try {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await sb.from('webhook_logs').insert({ ...__logCtx, latency_ms: Date.now() - __startTs });
    } catch {}
  };

  try {
    const payload = await req.json();
    __logCtx.request_payload = payload;
    __logCtx.event_type = payload?.event || null;
    __logCtx.external_id = payload?.data?.id || null;
    console.log("Melhor Envio webhook received:", JSON.stringify(payload));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Melhor Envio sends events about shipment/label updates
    if (payload?.event && payload?.data) {
      const { event, data } = payload;
      const shipmentId = data?.id;
      const tracking = data?.authorization_code || data?.tracking || data?.self_tracking || data?.melhorenvio_tracking;
      const status = data?.status;

      if (shipmentId) {
        const updateData: Record<string, unknown> = {};
        
        if (tracking) {
          updateData.tracking_code = tracking;
          updateData.tracking_url = `https://www.melhorrastreio.com.br/rastreio/${tracking}`;
          updateData.delivery_status = "SHIPPED";
        }

        if (status) {
          updateData.shipping_status = status;
          
          // Map ME statuses to delivery statuses
          if (status === 'posted') {
            updateData.delivery_status = 'SHIPPED';
          } else if (status === 'delivered') {
            updateData.delivery_status = 'DELIVERED';
          } else if (status === 'canceled') {
            updateData.delivery_status = 'RETURNED';
          }
        }

        // Also try to extract carrier info
        if (data?.service?.company?.name) {
          const compName = data.service.company.name;
          const svcName = data.service.name || '';
          updateData.shipping_service = compName && svcName ? `${compName} ${svcName}`.trim() : compName;
        }

        if (Object.keys(updateData).length > 0) {
          updateData.updated_at = new Date().toISOString();

          const { error } = await supabase
            .from("orders")
            .update(updateData)
            .eq("shipment_id", shipmentId);

          if (error) {
            console.error("Error updating order:", error);
          } else {
            console.log(`Order updated for shipment ${shipmentId}:`, JSON.stringify(updateData));

            // ── Notify customer about shipping update (SMTP via send-email) ──
            // Only send when the delivery_status actually changed to a meaningful state.
            const newDelivery = updateData.delivery_status as string | undefined;
            if (newDelivery && (newDelivery === 'SHIPPED' || newDelivery === 'DELIVERED' || newDelivery === 'RETURNED')) {
              try {
                const { data: order } = await supabase
                  .from('orders')
                  .select('id, customer_name, customer_email, tracking_code, tracking_url, delivery_status')
                  .eq('shipment_id', shipmentId)
                  .maybeSingle();
                if (order?.customer_email) {
                  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
                  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
                  const statusLabelMap: Record<string, string> = {
                    SHIPPED: 'Pedido enviado',
                    DELIVERED: 'Pedido entregue',
                    RETURNED: 'Envio cancelado',
                  };
                  const r = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
                    body: JSON.stringify({
                      template: 'shipping_update',
                      to: order.customer_email,
                      data: {
                        customer_name: order.customer_name,
                        order_id: order.id,
                        status: statusLabelMap[newDelivery] || newDelivery,
                        tracking_code: order.tracking_code || (updateData.tracking_code as string | undefined),
                        tracking_url: order.tracking_url || (updateData.tracking_url as string | undefined),
                      },
                    }),
                  });
                  console.log(`[ME Webhook] shipping email: ${r.status}`);
                }
              } catch (e) {
                console.error('[ME Webhook] shipping email error:', e);
              }
            }
          }
        }
      }

      // Log the event
      await supabase.from("shipping_logs").insert({
        order_id: null,
        event_type: `webhook_${event}`,
        request_payload: null,
        response_payload: payload,
        error_message: null,
      });
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    __logCtx.error_message = (error as Error)?.message || String(error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    await __writeLog();
  }
});
