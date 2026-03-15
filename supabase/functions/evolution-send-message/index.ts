import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { number, text } = await req.json();

    if (!number || !text) {
      return new Response(JSON.stringify({ error: 'number e text são obrigatórios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch Evolution API settings from site_settings
    const { data: settings } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', ['evolution_api_url', 'evolution_api_key', 'evolution_instance_name']);

    const settingsMap: Record<string, string> = {};
    for (const s of settings || []) {
      settingsMap[s.key] = s.value;
    }

    const apiUrl = settingsMap['evolution_api_url'];
    const apiKey = settingsMap['evolution_api_key'];
    const instanceName = settingsMap['evolution_instance_name'];

    if (!apiUrl || !apiKey || !instanceName) {
      return new Response(JSON.stringify({ error: 'Configurações da Evolution API não encontradas. Configure em Configurações.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Clean URL trailing slash
    const baseUrl = apiUrl.replace(/\/+$/, '');
    const url = `${baseUrl}/message/sendText/${instanceName}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
      },
      body: JSON.stringify({
        number: (() => {
          const cleaned = number.replace(/\D/g, '');
          // Add Brazil country code if not present
          return cleaned.startsWith('55') ? cleaned : `55${cleaned}`;
        })(),
        text,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Evolution API error:', data);
      return new Response(JSON.stringify({ error: `Erro da API: ${response.status}`, details: data }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
