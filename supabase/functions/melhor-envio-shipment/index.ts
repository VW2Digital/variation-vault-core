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
  const env = await getSetting(supabase, 'melhor_envio_environment') || 'sandbox';
  const token = await getSetting(supabase, `melhor_envio_token_${env}`);
  const expiresAt = await getSetting(supabase, `melhor_envio_token_expires_at_${env}`);
  
  if (!token) throw new Error('Token do Melhor Envio não configurado');
  
  const baseUrl = env === 'production'
    ? 'https://www.melhorenvio.com.br'
    : 'https://sandbox.melhorenvio.com.br';

  // Auto-refresh if token expires within 5 minutes
  if (expiresAt) {
    const expiryDate = new Date(expiresAt);
    const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);
    if (expiryDate <= fiveMinFromNow) {
      console.log('[ME] Token expiring soon, attempting refresh...');
      try {
        const refreshToken = await getSetting(supabase, `melhor_envio_refresh_token_${env}`);
        const clientId = await getSetting(supabase, `melhor_envio_client_id_${env}`);
        const clientSecret = await getSetting(supabase, `melhor_envio_client_secret_${env}`);
        
        if (refreshToken && clientId && clientSecret) {
          const tokenRes = await fetch(`${baseUrl}/oauth/token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'User-Agent': 'LibertyPharma (libertyluminaepharma@gmail.com)',
            },
            body: JSON.stringify({
              grant_type: 'refresh_token',
              client_id: clientId,
              client_secret: clientSecret,
              refresh_token: refreshToken,
            }),
          });

          if (tokenRes.ok) {
            const tokenData = JSON.parse(await tokenRes.text());
            const newExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

            await Promise.all([
              supabase.from('site_settings').update({ value: tokenData.access_token }).eq('key', `melhor_envio_token_${env}`),
              supabase.from('site_settings').update({ value: tokenData.refresh_token }).eq('key', `melhor_envio_refresh_token_${env}`),
              supabase.from('site_settings').update({ value: newExpiresAt }).eq('key', `melhor_envio_token_expires_at_${env}`),
            ]);

            console.log(`[ME] Token auto-refreshed. New expiry: ${newExpiresAt}`);
            return { token: tokenData.access_token, baseUrl };
          } else {
            console.error('[ME] Auto-refresh failed:', await tokenRes.text());
          }
        }
      } catch (err: any) {
        console.error('[ME] Auto-refresh error:', err.message);
      }
    }
  }

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

async function sendTrackingEmail(supabase: any, order: any, trackingCode: string, trackingUrl: string) {
  let resendApiKey = await getSetting(supabase, 'resend_api_key');
  if (!resendApiKey) resendApiKey = Deno.env.get('RESEND_API_KEY') || '';
  if (!resendApiKey) {
    console.log('[Email] Resend API Key não configurada, pulando envio de email');
    return;
  }
  const fromEmail = (await getSetting(supabase, 'resend_from_email')) || 'onboarding@resend.dev';

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #10b981;">
        <h1 style="color: #111827; margin: 0; font-size: 24px;">Liberty Pharma</h1>
        <p style="color: #6b7280; margin: 5px 0 0;">Seu pedido foi enviado! 🎉</p>
      </div>

      <div style="padding: 24px 0;">
        <p style="color: #374151; font-size: 16px;">Olá, <strong>${order.customer_name}</strong>!</p>
        <p style="color: #6b7280; font-size: 14px;">
          Seu pedido de <strong>${order.product_name}${order.dosage ? ' - ' + order.dosage : ''}</strong> foi despachado e já está a caminho.
        </p>

        <div style="background: #f3f4f6; border-radius: 12px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0 0 8px; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Código de Rastreio</p>
          <p style="margin: 0; color: #111827; font-size: 22px; font-weight: bold; letter-spacing: 2px;">${trackingCode}</p>
        </div>

        ${trackingUrl ? `
        <div style="text-align: center; margin: 24px 0;">
          <a href="${trackingUrl}" style="display: inline-block; background: #10b981; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px;">
            Rastrear meu pedido →
          </a>
        </div>
        ` : ''}

        <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 24px;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            Pedido: ${order.product_name} x${order.quantity}<br>
            Valor: R$ ${Number(order.total_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <div style="text-align: center; padding: 16px 0; border-top: 1px solid #e5e7eb;">
        <p style="color: #9ca3af; font-size: 11px; margin: 0;">
          Liberty Pharma — Este é um email automático, não responda.
        </p>
      </div>
    </div>
  `;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: `Liberty Pharma <${fromEmail}>`,
        to: [order.customer_email],
        subject: `Seu pedido foi enviado! Rastreio: ${trackingCode}`,
        html: emailHtml,
      }),
    });

    const result = await res.text();
    console.log(`[Email] Resend response [${res.status}]: ${result}`);
  } catch (err: any) {
    console.error('[Email] Error sending:', err.message);
  }
}

// Fetch shipment details to extract tracking and carrier info
async function fetchShipmentDetails(baseUrl: string, token: string, shipmentId: string) {
  try {
    const data = await melhorEnvioFetch(baseUrl, token, `/api/v2/me/orders/${shipmentId}`, 'GET');
    const volumeTracking = data?.volumes?.[0]?.tracking || '';
    console.log(`[ME] Shipment details status: ${data?.status}, tracking: ${data?.tracking || 'none'}, self_tracking: ${data?.self_tracking || 'none'}, protocol: ${data?.protocol || 'none'}, volume_tracking: ${volumeTracking || 'none'}`);
    return data;
  } catch (err: any) {
    console.error('[ME] Failed to fetch shipment details:', err.message);
    return null;
  }
}

// Extract tracking code from multiple possible sources
function extractTrackingInfo(shipmentDetails: any, trackingResult: any, shipmentId: string) {
  let trackingCode = '';
  let serviceName = '';
  let companyName = '';

  // Priority: authorization_code (real carrier code) > tracking > volume tracking > self_tracking (ME internal)
  if (shipmentDetails) {
    const volumeTracking = shipmentDetails.volumes?.[0]?.tracking || '';
    trackingCode = shipmentDetails.authorization_code
      || shipmentDetails.tracking 
      || volumeTracking
      || shipmentDetails.self_tracking 
      || shipmentDetails.melhorenvio_tracking 
      || '';
    serviceName = shipmentDetails.service?.name || '';
    companyName = shipmentDetails.service?.company?.name || '';
  }

  // Fallback to tracking endpoint result
  if (!trackingCode && trackingResult) {
    const trackingData = trackingResult?.[shipmentId];
    trackingCode = trackingData?.authorization_code || trackingData?.tracking || trackingData?.melhorenvio_tracking || '';
  }

  // Build display name: "Jadlog .Com" or just "Jadlog"
  const displayName = companyName && serviceName 
    ? `${companyName} ${serviceName}`.trim()
    : companyName || serviceName || '';

  return { trackingCode, displayName };
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
    const action = body.action || 'full_flow';

    // ─── FETCH PROFILE ACTION ───
    if (action === 'fetch_profile') {
      const { token, baseUrl } = await getMelhorEnvioConfig(supabase);
      const profileData = await melhorEnvioFetch(baseUrl, token, '/api/v2/me', 'GET');
      
      console.log('[ME] Profile raw data keys:', JSON.stringify(Object.keys(profileData || {})));
      console.log('[ME] Profile phone:', JSON.stringify(profileData?.phone));
      console.log('[ME] Profile address:', JSON.stringify(profileData?.address));
      
      // Extract address from the first company or user data
      const company = profileData?.companies?.[0] || {};
      const companyAddress = company?.address || {};
      const userAddress = profileData?.address || {};
      const address = companyAddress?.postal_code ? companyAddress : userAddress;
      
      console.log('[ME] Company:', JSON.stringify({ name: company?.name, document: company?.document, phone: company?.phone }));
      console.log('[ME] Company address:', JSON.stringify(companyAddress));
      
      // Phone: try company phone first, then user phone
      let phone = '';
      const companyPhone = company?.phone;
      const userPhone = profileData?.phone;
      if (companyPhone?.phone) {
        phone = (companyPhone.area_code || '') + companyPhone.phone;
      } else if (typeof companyPhone === 'string' && companyPhone) {
        phone = companyPhone;
      } else if (userPhone?.phone) {
        phone = (userPhone.area_code || '') + userPhone.phone;
      } else if (typeof userPhone === 'string' && userPhone) {
        phone = userPhone;
      }

      // City and state may be nested objects or strings
      const cityObj = address?.city;
      const cityName = typeof cityObj === 'object' ? (cityObj?.city || cityObj?.name || '') : (cityObj || '');
      const stateAbbr = typeof cityObj === 'object' ? (cityObj?.state?.state_abbr || cityObj?.state?.uf || '') : (address?.state_abbr || address?.state || '');

      const result = {
        name: company?.name || ((profileData?.firstname || '') + ' ' + (profileData?.lastname || '')).trim(),
        phone,
        email: profileData?.email || '',
        document: company?.document || profileData?.document || '',
        postal_code: address?.postal_code || '',
        address: address?.address || address?.street || '',
        number: address?.number || '',
        complement: address?.complement || '',
        district: address?.district || '',
        city: cityName,
        state: stateAbbr,
      };

      console.log('[ME] Mapped profile result:', JSON.stringify(result));

      return new Response(JSON.stringify({ success: true, profile: result }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── QUOTE ACTION (no order needed) ───
    if (action === 'quote') {
      const { token, baseUrl } = await getMelhorEnvioConfig(supabase);
      const senderJson = await getSetting(supabase, 'melhor_envio_sender');
      let sender: any;
      try { sender = JSON.parse(senderJson); } catch {
        throw new Error('Endereço do remetente não configurado.');
      }

      const quotePayload = {
        from: { postal_code: sender.postal_code?.replace(/\D/g, '') },
        to: { postal_code: body.postal_code?.replace(/\D/g, '') },
        products: [{
          id: 'quote',
          width: sender.package_width || 12,
          height: sender.package_height || 4,
          length: sender.package_length || 17,
          weight: sender.package_weight || 0.1,
          insurance_value: Number(body.insurance_value || 0),
          quantity: body.quantity || 1,
        }],
      };

      const quoteResult = await melhorEnvioFetch(baseUrl, token, '/api/v2/me/shipment/calculate', 'POST', quotePayload);

      const services = (Array.isArray(quoteResult) ? quoteResult : [])
        .filter((s: any) => !s.error && s.id && s.price)
        .map((s: any) => ({
          id: s.id,
          name: s.name || s.company?.name || 'Transportadora',
          company: s.company?.name || '',
          price: Number(s.price),
          delivery_time: s.delivery_time || s.custom_delivery_time || null,
          currency: 'BRL',
        }))
        .sort((a: any, b: any) => a.price - b.price);

      return new Response(JSON.stringify({ services }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── BATCH REFRESH TRACKING (called by cron) ───
    if (action === 'batch_refresh_tracking') {
      const { token, baseUrl } = await getMelhorEnvioConfig(supabase);

      // Find all orders with shipment_id but no tracking_code
      const { data: pendingOrders, error: pendingErr } = await supabase
        .from('orders')
        .select('id, shipment_id, tracking_code, shipping_service, shipping_status')
        .not('shipment_id', 'is', null)
        .is('tracking_code', null)
        .limit(20);

      if (pendingErr) throw new Error('Erro ao buscar pedidos pendentes: ' + pendingErr.message);

      const results: any[] = [];
      for (const order of (pendingOrders || [])) {
        try {
          const shipmentDetails = await fetchShipmentDetails(baseUrl, token, order.shipment_id!);

          let trackingResult = null;
          try {
            trackingResult = await melhorEnvioFetch(baseUrl, token, '/api/v2/me/shipment/tracking', 'POST', { orders: [order.shipment_id] });
          } catch (_e) { /* non-fatal */ }

          const { trackingCode, displayName } = extractTrackingInfo(shipmentDetails, trackingResult, order.shipment_id!);

          const updateData: Record<string, any> = {};
          if (trackingCode) {
            updateData.tracking_code = trackingCode;
            updateData.tracking_url = `https://www.melhorrastreio.com.br/rastreio/${trackingCode}`;
            updateData.delivery_status = 'SHIPPED';
          }
          if (displayName && displayName !== order.shipping_service) {
            updateData.shipping_service = displayName;
          }
          const meStatus = shipmentDetails?.status;
          if (meStatus) {
            updateData.shipping_status = meStatus;
            if (meStatus === 'delivered') updateData.delivery_status = 'DELIVERED';
            if (meStatus === 'posted') updateData.delivery_status = 'SHIPPED';
          }

          if (Object.keys(updateData).length > 0) {
            updateData.updated_at = new Date().toISOString();
            await supabase.from('orders').update(updateData).eq('id', order.id);
            console.log(`[ME][CRON] Order ${order.id} updated:`, JSON.stringify(updateData));
          }

          // Send email if tracking code was just found
          if (trackingCode) {
            const { data: freshOrder } = await supabase.from('orders').select('*').eq('id', order.id).single();
            if (freshOrder) {
              await sendTrackingEmail(supabase, freshOrder, trackingCode, `https://www.melhorrastreio.com.br/rastreio/${trackingCode}`);
            }
          }

          results.push({ order_id: order.id, tracking_code: trackingCode || null, updated: Object.keys(updateData).length > 0 });
        } catch (e: any) {
          console.error(`[ME][CRON] Error for order ${order.id}:`, e.message);
          results.push({ order_id: order.id, error: e.message });
        }
      }

      return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── REFRESH TRACKING ACTION ───
    if (action === 'refresh_tracking') {
      orderId = body.order_id;
      const { token, baseUrl } = await getMelhorEnvioConfig(supabase);
      
      const { data: order, error: orderError } = await supabase
        .from('orders').select('*').eq('id', orderId).single();
      if (orderError || !order) throw new Error('Pedido não encontrado');
      // If no shipment_id, try to search recent ME orders by customer info
      if (!order.shipment_id) {
        console.log('[ME] No shipment_id, searching recent ME orders...');
        try {
          // Search ME orders to find a matching shipment
          const searchData = await melhorEnvioFetch(baseUrl, token, '/api/v2/me/orders?status=posted,released,delivered&limit=50', 'GET');
          const meOrders = searchData?.data || (Array.isArray(searchData) ? searchData : []);
          
          // Try to match by customer name or address
          const customerName = (order.customer_name || '').toLowerCase().trim();
          const customerPostal = (order.customer_postal_code || '').replace(/\D/g, '');
          
          let matchedOrder = null;
          for (const meOrder of meOrders) {
            const toName = (meOrder?.to?.name || '').toLowerCase().trim();
            const toPostal = (meOrder?.to?.postal_code || '').replace(/\D/g, '');
            if ((customerName && toName.includes(customerName)) || 
                (customerPostal && toPostal === customerPostal && customerPostal.length >= 8)) {
              matchedOrder = meOrder;
              break;
            }
          }
          
          if (matchedOrder) {
            console.log(`[ME] Found matching ME order: ${matchedOrder.id}`);
            // Save shipment_id to order
            await supabase.from('orders').update({ 
              shipment_id: String(matchedOrder.id),
              updated_at: new Date().toISOString()
            }).eq('id', orderId);
            order.shipment_id = String(matchedOrder.id);
          } else {
            // If no match found, return what we have
            return new Response(JSON.stringify({ 
              success: false, 
              error: 'Nenhum envio encontrado no Melhor Envio para este pedido. Verifique se a etiqueta foi gerada.',
              searched: meOrders.length,
            }), {
              status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        } catch (searchErr: any) {
          console.error('[ME] Search error:', searchErr.message);
          throw new Error('Pedido sem envio registrado e não foi possível buscar no Melhor Envio: ' + searchErr.message);
        }
      }

      // Fetch shipment details from ME
      const shipmentDetails = await fetchShipmentDetails(baseUrl, token, order.shipment_id);
      await logShipping(supabase, orderId, 'refresh_tracking_details', shipmentDetails);

      // Also try the tracking endpoint
      let trackingResult = null;
      try {
        trackingResult = await melhorEnvioFetch(baseUrl, token, '/api/v2/me/shipment/tracking', 'POST', { orders: [order.shipment_id] });
        await logShipping(supabase, orderId, 'refresh_tracking_response', trackingResult);
      } catch (e: any) {
        console.log('[ME] Tracking endpoint error (non-fatal):', e.message);
      }

      const { trackingCode, displayName } = extractTrackingInfo(shipmentDetails, trackingResult, order.shipment_id);

      const updateData: Record<string, any> = {};
      if (trackingCode && trackingCode !== order.tracking_code) {
        updateData.tracking_code = trackingCode;
        updateData.tracking_url = `https://www.melhorrastreio.com.br/rastreio/${trackingCode}`;
        updateData.delivery_status = 'SHIPPED';
      }
      if (displayName && displayName !== order.shipping_service) {
        updateData.shipping_service = displayName;
      }

      // Update ME status
      const meStatus = shipmentDetails?.status;
      if (meStatus) {
        const statusMap: Record<string, string> = {
          'released': 'released',
          'posted': 'posted',
          'delivered': 'delivered',
          'canceled': 'canceled',
        };
        if (statusMap[meStatus]) {
          updateData.shipping_status = statusMap[meStatus];
        }
        if (meStatus === 'delivered') {
          updateData.delivery_status = 'DELIVERED';
        }
        if (meStatus === 'posted') {
          updateData.delivery_status = 'SHIPPED';
        }
      }

      if (Object.keys(updateData).length > 0) {
        updateData.updated_at = new Date().toISOString();
        await supabase.from('orders').update(updateData).eq('id', orderId);
        console.log(`[ME] Order ${orderId} updated:`, JSON.stringify(updateData));
      }

      // Send email if tracking code was just found
      if (trackingCode && trackingCode !== order.tracking_code) {
        const { data: freshOrder } = await supabase.from('orders').select('*').eq('id', orderId).single();
        if (freshOrder) {
          const trackingUrl = `https://www.melhorrastreio.com.br/rastreio/${trackingCode}`;
          await sendTrackingEmail(supabase, freshOrder, trackingCode, trackingUrl);
        }
      }

      return new Response(JSON.stringify({ 
        success: true, 
        tracking_code: trackingCode || order.tracking_code || '',
        shipping_service: displayName || order.shipping_service || '',
        status: meStatus || order.shipping_status,
        updated: Object.keys(updateData).length > 0,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    orderId = body.order_id;
    let serviceId = body.service_id || null;
    const { token, baseUrl } = await getMelhorEnvioConfig(supabase);

    const { data: order, error: orderError } = await supabase
      .from('orders').select('*').eq('id', orderId).single();
    if (orderError || !order) throw new Error('Pedido não encontrado');

    const senderJson = await getSetting(supabase, 'melhor_envio_sender');
    let sender: any;
    try { sender = JSON.parse(senderJson); } catch {
      throw new Error('Endereço do remetente não configurado. Vá em Configurações → Melhor Envio → Endereço do Remetente.');
    }

    if (!order.customer_postal_code) {
      throw new Error('CEP do cliente não informado no pedido');
    }

    let shipmentId = order.shipment_id;
    let selectedServiceName = '';
    let quoteFailureDetails = '';

    // ─── AUTO-DETECT SERVICE: Quote available carriers ───
    if (!serviceId && (action === 'full_flow' || action === 'create_shipment')) {
      console.log('[ME] No service_id provided, auto-detecting via quote...');
      const quotePayload = {
        from: { postal_code: sender.postal_code?.replace(/\D/g, '') },
        to: { postal_code: order.customer_postal_code?.replace(/\D/g, '') },
        products: [{
          id: orderId,
          width: sender.package_width || 12,
          height: sender.package_height || 4,
          length: sender.package_length || 17,
          weight: sender.package_weight || 0.1,
          insurance_value: Number(order.total_value),
          quantity: order.quantity || 1,
        }],
      };

      await logShipping(supabase, orderId, 'quote_request', quotePayload);
      try {
        const quoteResult = await melhorEnvioFetch(baseUrl, token, '/api/v2/me/shipment/calculate', 'POST', quotePayload);
        await logShipping(supabase, orderId, 'quote_response', quoteResult);

        const available = (Array.isArray(quoteResult) ? quoteResult : [])
          .filter((s: any) => !s.error && s.id && s.price);

        if (available.length === 0) {
          quoteFailureDetails = (Array.isArray(quoteResult) ? quoteResult : [])
            .filter((s: any) => s.error)
            .map((s: any) => `${s.company?.name || s.name || 'unknown'}: ${s.error}`)
            .join('; ');
          console.warn(`[ME] Quote returned no available carrier. Details: ${quoteFailureDetails || 'sem resposta'}`);
        } else {
          available.sort((a: any, b: any) => Number(a.price) - Number(b.price));
          serviceId = available[0].id;
          const compName = available[0].company?.name || '';
          const svcName = available[0].name || '';
          selectedServiceName = compName && svcName ? `${compName} ${svcName}`.trim() : compName || svcName || `service_${serviceId}`;
          console.log(`[ME] Auto-selected service: ${selectedServiceName} (id=${serviceId}, price=R$${available[0].price})`);
        }
      } catch (quoteErr: any) {
        quoteFailureDetails = quoteErr?.message || 'falha na cotação';
        console.error('[ME] Quote failed, will try fallback services on cart creation:', quoteFailureDetails);
      }
    }

    if (!serviceId) serviceId = null;

    // ─── STEP 1: ADD TO CART ───
    if (action === 'full_flow' || action === 'create_shipment') {
      const fallbackServiceIds = [1, 2, 17, 3, 4, 9, 10, 11, 12, 13, 16];
      const candidateServices = Array.from(new Set([
        ...(serviceId ? [Number(serviceId)] : []),
        ...fallbackServiceIds,
      ])).filter((id) => Number.isFinite(id) && id > 0);

      let lastCartError = '';
      let cartResult: any = null;

      for (const candidateServiceId of candidateServices) {
        const cartPayload = {
          service: candidateServiceId,
          from: {
            name: sender.name, phone: sender.phone, email: sender.email,
            document: sender.document, address: sender.address,
            number: sender.number || 'S/N', complement: sender.complement || '',
            district: sender.district, city: sender.city, state_abbr: sender.state,
            country_id: 'BR', postal_code: sender.postal_code?.replace(/\D/g, ''),
          },
          to: {
            name: order.customer_name, phone: order.customer_phone || '',
            email: order.customer_email, document: order.customer_cpf,
            address: order.customer_address || '', number: order.customer_number || 'S/N',
            complement: order.customer_complement || '', district: order.customer_district || '',
            city: order.customer_city || '', state_abbr: order.customer_state || '',
            country_id: 'BR', postal_code: order.customer_postal_code?.replace(/\D/g, ''),
          },
          products: [{ name: order.product_name, quantity: order.quantity, unitary_value: Number(order.unit_price) }],
          volumes: [{
            height: sender.package_height || 4, width: sender.package_width || 12,
            length: sender.package_length || 17, weight: sender.package_weight || 0.1,
          }],
          options: { insurance_value: Number(order.total_value), receipt: false, own_hand: false },
        };

        await logShipping(supabase, orderId, 'cart_add_request', { ...cartPayload, attempted_service: candidateServiceId });

        try {
          cartResult = await melhorEnvioFetch(baseUrl, token, '/api/v2/me/cart', 'POST', cartPayload);
          await logShipping(supabase, orderId, 'cart_add_response', cartResult);

          shipmentId = cartResult.id;
          serviceId = candidateServiceId;

          if (!selectedServiceName) {
            const svc = cartResult.service;
            if (svc) {
              const compName = svc.company?.name || '';
              const svcName = svc.name || '';
              selectedServiceName = compName && svcName ? `${compName} ${svcName}`.trim() : compName || svcName || `service_${candidateServiceId}`;
            } else {
              selectedServiceName = `service_${candidateServiceId}`;
            }
          }

          console.log(`[ME] Cart created with service ${candidateServiceId}, shipment_id=${shipmentId}`);
          break;
        } catch (cartErr: any) {
          lastCartError = cartErr?.message || 'erro ao adicionar no carrinho';
          await logShipping(supabase, orderId, 'cart_add_error', {
            attempted_service: candidateServiceId,
            error: lastCartError,
          });
          console.warn(`[ME] Cart attempt failed for service ${candidateServiceId}: ${lastCartError}`);
        }
      }

      if (!shipmentId) {
        const quoteHint = quoteFailureDetails ? ` Cotação: ${quoteFailureDetails}.` : '';
        throw new Error(`Não foi possível criar envio com os serviços testados.${quoteHint} Último erro: ${lastCartError || 'sem detalhes'}`);
      }

      await supabase.from('orders').update({
        shipment_id: shipmentId,
        shipping_status: 'cart',
        shipping_service: selectedServiceName || `service_${serviceId}`,
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
      const checkoutResult = await melhorEnvioFetch(baseUrl, token, '/api/v2/me/shipment/checkout', 'POST', { orders: [shipmentId] });
      await logShipping(supabase, orderId, 'checkout_response', checkoutResult);
      await supabase.from('orders').update({ shipping_status: 'purchased' }).eq('id', orderId);
      if (action === 'checkout') {
        return new Response(JSON.stringify({ success: true, checkout: checkoutResult }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ─── STEP 3: GENERATE LABEL ───
    if (action === 'full_flow' || action === 'generate_label') {
      const generateResult = await melhorEnvioFetch(baseUrl, token, '/api/v2/me/shipment/generate', 'POST', { orders: [shipmentId] });
      await logShipping(supabase, orderId, 'generate_label_response', generateResult);
      await supabase.from('orders').update({ shipping_status: 'generated' }).eq('id', orderId);
      if (action === 'generate_label') {
        return new Response(JSON.stringify({ success: true, generate: generateResult }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ─── STEP 4: PRINT LABEL (GET URL) ───
    if (action === 'full_flow' || action === 'print_label') {
      const printResult = await melhorEnvioFetch(baseUrl, token, '/api/v2/me/shipment/print', 'POST', { orders: [shipmentId] });
      await logShipping(supabase, orderId, 'print_label_response', printResult);
      const labelUrl = printResult?.url || '';
      await supabase.from('orders').update({ label_url: labelUrl }).eq('id', orderId);
      if (action === 'print_label') {
        return new Response(JSON.stringify({ success: true, label_url: labelUrl }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ─── STEP 5: GET TRACKING (multiple attempts) ───
    if (action === 'full_flow' || action === 'get_tracking') {
      let trackingCode = '';
      let trackingUrl = '';

      // Method 1: Fetch shipment details (GET endpoint - most reliable)
      const shipmentDetails = await fetchShipmentDetails(baseUrl, token, shipmentId);
      await logShipping(supabase, orderId, 'shipment_details_response', shipmentDetails);

      if (shipmentDetails) {
        trackingCode = shipmentDetails.authorization_code || shipmentDetails.tracking || shipmentDetails.self_tracking || shipmentDetails.melhorenvio_tracking || '';
        
        // Update service name from details if available
        if (shipmentDetails.service) {
          const compName = shipmentDetails.service.company?.name || '';
          const svcName = shipmentDetails.service.name || '';
          const fullName = compName && svcName ? `${compName} ${svcName}`.trim() : compName || svcName;
          if (fullName) {
            await supabase.from('orders').update({ shipping_service: fullName }).eq('id', orderId);
          }
        }
      }

      // Method 2: Tracking endpoint (fallback)
      if (!trackingCode) {
        try {
          const trackingResult = await melhorEnvioFetch(baseUrl, token, '/api/v2/me/shipment/tracking', 'POST', { orders: [shipmentId] });
          await logShipping(supabase, orderId, 'tracking_response', trackingResult);
          const trackingData = trackingResult?.[shipmentId];
          trackingCode = trackingData?.authorization_code || trackingData?.tracking || trackingData?.melhorenvio_tracking || '';
        } catch (e: any) {
          console.log('[ME] Tracking endpoint error (non-fatal):', e.message);
        }
      }

      if (trackingCode) {
        trackingUrl = `https://www.melhorrastreio.com.br/rastreio/${trackingCode}`;
      }

      // Always mark as shipped after label generation, even without tracking code
      const updateData: Record<string, any> = {
        shipping_status: 'shipped',
        delivery_status: 'SHIPPED',
      };

      if (trackingCode) {
        updateData.tracking_code = trackingCode;
        updateData.tracking_url = trackingUrl;
      }

      await supabase.from('orders').update(updateData).eq('id', orderId);

      // Send tracking email if we have a code
      if (trackingCode) {
        const { data: freshOrder } = await supabase.from('orders').select('*').eq('id', orderId).single();
        if (freshOrder) {
          await sendTrackingEmail(supabase, freshOrder, trackingCode, trackingUrl);
        }
      } else {
        console.log(`[ME] No tracking code available yet for shipment ${shipmentId}. Status: ${shipmentDetails?.status || 'unknown'}. Will be updated via webhook or manual refresh.`);
      }

      if (action === 'get_tracking') {
        return new Response(JSON.stringify({ 
          success: true, 
          tracking_code: trackingCode,
          tracking_available: !!trackingCode,
          shipment_status: shipmentDetails?.status || 'unknown',
        }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { data: updatedOrder } = await supabase
      .from('orders').select('shipment_id, shipping_status, tracking_code, label_url, tracking_url, shipping_service')
      .eq('id', orderId).single();

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Fluxo completo executado', 
      tracking_available: !!updatedOrder?.tracking_code,
      ...updatedOrder,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[Shipment] Error:', error.message);
    if (orderId) await logShipping(supabase, orderId, 'error', null, error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
