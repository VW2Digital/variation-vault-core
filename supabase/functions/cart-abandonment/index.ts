import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch Resend settings
    const { data: settings } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', ['resend_api_key', 'resend_from_email']);

    const cfg: Record<string, string> = {};
    (settings || []).forEach((s: any) => { cfg[s.key] = s.value; });

    const resendApiKey = cfg['resend_api_key'] || Deno.env.get('RESEND_API_KEY');
    const fromEmail = cfg['resend_from_email'] || 'noreply@libertypharma.com.br';

    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'Resend API key not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find users with cart items older than 2 hours who haven't been emailed in the last 24 hours
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Get all cart items older than 2 hours, grouped by user
    const { data: cartItems } = await supabase
      .from('cart_items')
      .select('user_id, product_id, variation_id, quantity, updated_at')
      .lt('updated_at', twoHoursAgo);

    if (!cartItems || cartItems.length === 0) {
      return new Response(JSON.stringify({ message: 'No abandoned carts found', sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Group by user_id
    const userCarts: Record<string, typeof cartItems> = {};
    cartItems.forEach((item) => {
      if (!userCarts[item.user_id]) userCarts[item.user_id] = [];
      userCarts[item.user_id].push(item);
    });

    const userIds = Object.keys(userCarts);

    // Check which users were already emailed recently
    const { data: recentLogs } = await supabase
      .from('cart_abandonment_logs')
      .select('user_id')
      .in('user_id', userIds)
      .gt('email_sent_at', oneDayAgo);

    const recentlyEmailed = new Set((recentLogs || []).map((l: any) => l.user_id));

    // Get user profiles and auth emails
    const eligibleUserIds = userIds.filter(uid => !recentlyEmailed.has(uid));

    if (eligibleUserIds.length === 0) {
      return new Response(JSON.stringify({ message: 'All users already emailed recently', sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get profiles for names
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name')
      .in('user_id', eligibleUserIds);

    const profileMap: Record<string, string> = {};
    (profiles || []).forEach((p: any) => { profileMap[p.user_id] = p.full_name; });

    // Get emails from auth.users via admin API
    const { data: { users: authUsers } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const emailMap: Record<string, string> = {};
    (authUsers || []).forEach((u: any) => { emailMap[u.id] = u.email; });

    // Get product names for the cart items
    const productIds = [...new Set(cartItems.map(i => i.product_id))];
    const { data: products } = await supabase
      .from('products')
      .select('id, name')
      .in('id', productIds);
    const productMap: Record<string, string> = {};
    (products || []).forEach((p: any) => { productMap[p.id] = p.name; });

    let sentCount = 0;

    for (const userId of eligibleUserIds) {
      const email = emailMap[userId];
      if (!email) continue;

      const name = profileMap[userId] || 'Cliente';
      const items = userCarts[userId];
      const itemNames = items.map(i => productMap[i.product_id] || 'Produto').join(', ');

      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a2e;">Olá, ${name}! 👋</h2>
          <p style="color: #333; font-size: 16px;">
            Notamos que você deixou alguns itens no seu carrinho. Não perca a oportunidade de garantir seus produtos!
          </p>
          <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <h3 style="color: #1a1a2e; margin-top: 0;">Seus itens aguardam por você:</h3>
            <p style="color: #555; font-size: 14px;">
              ${items.map(i => `• ${productMap[i.product_id] || 'Produto'} (Qtd: ${i.quantity})`).join('<br/>')}
            </p>
          </div>
          <a href="https://variation-vault-core.lovable.app/carrinho"
             style="display: inline-block; background: #1a1a2e; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">
            Finalizar minha compra →
          </a>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">
            Se você já finalizou sua compra, por favor ignore este e-mail.
          </p>
        </div>
      `;

      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: email,
            subject: `${name}, seus itens estão esperando por você! 🛒`,
            html: htmlBody,
          }),
        });

        if (res.ok) {
          // Log that we sent an email
          await supabase.from('cart_abandonment_logs').insert({
            user_id: userId,
            cart_item_count: items.length,
          });
          sentCount++;
        }
      } catch (e) {
        console.error(`Failed to send email to ${email}:`, e);
      }
    }

    return new Response(JSON.stringify({ message: `Sent ${sentCount} abandonment emails`, sent: sentCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Cart abandonment error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
