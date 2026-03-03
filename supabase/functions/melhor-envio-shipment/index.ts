import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function getSetting(supabase: any, key: string) {
  const { data } = await supabase.from('site_settings').select('value').eq('key', key).maybeSingle();
  return data?.value || '';
}

async function getMelhorEnvioConfig(supabase: any) {
  const token = await getSetting(supabase, 'melhor_envio_token');
  const env = await getSetting(supabase, 'melhor_envio_environment') || 'sandbox';

  if (!token) throw new Error('Token do Melhor Envio não configurado');

  const baseUrl = env === 'production'
    ? 'https://api.melhorenvio.com.br'
    : 'https://sandbox.melhorenvio.com.br';

  return { token, baseUrl };
}

async function melhorEnvioFetch(baseUrl: string, token: string, path: string, method: string, body?: any) {
  console.log(`[ME] ${method} ${path}`);
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'LibertyPharma (libertyluminaepharma@gmail.com)',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!res.ok) {
    console.error('[ME] API error:', text);
    throw new Error(`Melhor Envio error [${res.status}]: ${text}`);
  }
  return data;
}

async function logShipping(supabase: any, orderId: string, eventType: string, payload: any, error?: string) {
  await supabase.from('shipping_logs').insert({
    order_id: orderId,
    event_type: eventType,
    ...(error ? { error_message: error } : {}),
    ...(eventType.includes('request') ? { request_payload: payload } : { response_payload: payload }),
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  let orderId = '';

  try {
    const body = await req.json();
    orderId = body.order_id;
    const action = body.action || 'full_flow';
    const serviceId = body.service_id || 1; // 1=PAC, 2=SEDEX, etc.

    if (!orderId) throw new Error('order_id é obrigatório');

    const { token, baseUrl } = await getMelhorEnvioConfig(supabase);

    // Fetch order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !order) throw new Error('Pedido não encontrado');

    // Get sender address from settings
    const senderJson = await getSetting(supabase, 'melhor_envio_sender');
    let sender: any;
    try { sender = JSON.parse(senderJson); } catch {
      throw new Error('Endereço do remetente não configurado. Vá em Configurações → Melhor Envio → Endereço do Remetente.');
    }

    // Validate recipient address
    if (!order.customer_postal_code) {
      throw new Error('CEP do cliente não informado no pedido');
    }

    let shipmentId = order.shipment_id;

    // ─── STEP 1: ADD TO CART ───
    if (action === 'full_flow' || action === 'create_shipment') {
      const cartPayload = {
        service: serviceId,
        from: {
          name: sender.name,
          phone: sender.phone,
          email: sender.email,
          document: sender.document,
          address: sender.address,
          number: sender.number || 'S/N',
          complement: sender.complement || '',
          district: sender.district,
          city: sender.city,
          state_abbr: sender.state,
          country_id: 'BR',
          postal_code: sender.postal_code,
        },
        to: {
          name: order.customer_name,
          phone: order.customer_phone || '',
          email: order.customer_email,
          document: order.customer_cpf,
          address: order.customer_address || '',
          number: order.customer_number || 'S/N',
          complement: order.customer_complement || '',
          district: order.customer_district || '',
          city: order.customer_city || '',
          state_abbr: order.customer_state || '',
          country_id: 'BR',
          postal_code: order.customer_postal_code,
        },
        products: [
          {
            name: order.product_name,
            quantity: order.quantity,
            unitary_value: Number(order.unit_price),
          }
        ],
        volumes: [
          {
            height: sender.package_height || 4,
            width: sender.package_width || 12,
            length: sender.package_length || 17,
            weight: sender.package_weight || 0.1,
          }
        ],
        options: {
          insurance_value: Number(order.total_value),
          receipt: false,
          own_hand: false,
        },
      };

      await logShipping(supabase, orderId, 'cart_add_request', cartPayload);
      const cartResult = await melhorEnvioFetch(baseUrl, token, '/api/v2/me/cart', 'POST', cartPayload);
      await logShipping(supabase, orderId, 'cart_add_response', cartResult);

      shipmentId = cartResult.id;
      await supabase.from('orders').update({
        shipment_id: shipmentId,
        shipping_status: 'cart',
        shipping_service: `service_${serviceId}`,
      }).eq('id', orderId);

      if (action === 'create_shipment') {
        return new Response(JSON.stringify({ success: true, shipment_id: shipmentId }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (!shipmentId) throw new Error('shipment_id não encontrado. Crie o envio primeiro.');

    // ─── STEP 2: CHECKOUT (PURCHASE) ───
    if (action === 'full_flow' || action === 'checkout') {
      const checkoutResult = await melhorEnvioFetch(baseUrl, token, '/api/v2/me/shipment/checkout', 'POST', {
        orders: [shipmentId],
      });
      await logShipping(supabase, orderId, 'checkout_response', checkoutResult);

      await supabase.from('orders').update({
        shipping_status: 'purchased',
      }).eq('id', orderId);

      if (action === 'checkout') {
        return new Response(JSON.stringify({ success: true, checkout: checkoutResult }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ─── STEP 3: GENERATE LABEL ───
    if (action === 'full_flow' || action === 'generate_label') {
      const generateResult = await melhorEnvioFetch(baseUrl, token, '/api/v2/me/shipment/generate', 'POST', {
        orders: [shipmentId],
      });
      await logShipping(supabase, orderId, 'generate_label_response', generateResult);

      await supabase.from('orders').update({
        shipping_status: 'generated',
      }).eq('id', orderId);

      if (action === 'generate_label') {
        return new Response(JSON.stringify({ success: true, generate: generateResult }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ─── STEP 4: PRINT LABEL (GET URL) ───
    if (action === 'full_flow' || action === 'print_label') {
      const printResult = await melhorEnvioFetch(baseUrl, token, '/api/v2/me/shipment/print', 'POST', {
        orders: [shipmentId],
      });
      await logShipping(supabase, orderId, 'print_label_response', printResult);

      const labelUrl = printResult?.url || '';
      await supabase.from('orders').update({
        label_url: labelUrl,
      }).eq('id', orderId);

      if (action === 'print_label') {
        return new Response(JSON.stringify({ success: true, label_url: labelUrl }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ─── STEP 5: GET TRACKING ───
    if (action === 'full_flow' || action === 'get_tracking') {
      const trackingResult = await melhorEnvioFetch(baseUrl, token, '/api/v2/me/shipment/tracking', 'POST', {
        orders: [shipmentId],
      });
      await logShipping(supabase, orderId, 'tracking_response', trackingResult);

      const trackingData = trackingResult?.[shipmentId];
      const trackingCode = trackingData?.tracking || '';
      const trackingUrl = trackingData?.melhorenvio_tracking
        ? `https://www.melhorrastreio.com.br/rastreio/${trackingCode}`
        : '';

      await supabase.from('orders').update({
        shipping_status: 'shipped',
        tracking_code: trackingCode,
        tracking_url: trackingUrl,
        delivery_status: 'SHIPPED',
      }).eq('id', orderId);

      if (action === 'get_tracking') {
        return new Response(JSON.stringify({ success: true, tracking_code: trackingCode }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Full flow completed
    const { data: updatedOrder } = await supabase
      .from('orders')
      .select('shipment_id, shipping_status, tracking_code, label_url, tracking_url')
      .eq('id', orderId)
      .single();

    return new Response(JSON.stringify({
      success: true,
      message: 'Fluxo completo executado com sucesso',
      ...updatedOrder,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[Shipment] Error:', error.message);

    if (orderId) {
      await logShipping(supabase, orderId, 'error', null, error.message);
    }

    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
