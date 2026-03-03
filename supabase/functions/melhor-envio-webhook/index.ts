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

  try {
    const payload = await req.json();
    console.log("Melhor Envio webhook received:", JSON.stringify(payload));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Melhor Envio sends events about shipment/label updates
    if (payload?.event && payload?.data) {
      const { event, data } = payload;
      const shipmentId = data?.id;
      const tracking = data?.tracking;
      const status = data?.status;

      if (shipmentId) {
        // Update order that matches this shipment_id
        const updateData: Record<string, unknown> = {};
        if (tracking) {
          updateData.tracking_code = tracking;
          updateData.delivery_status = "SHIPPED";
        }
        if (status) {
          updateData.shipping_status = status;
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
            console.log(`Order updated for shipment ${shipmentId}`);
          }
        }
      }

      // Log the event
      await supabase.from("shipping_logs").insert({
        order_id: null,
        event_type: event,
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
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 200, // Return 200 to avoid retries
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
