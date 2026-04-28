import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { subject = "", currentHtml = "", instructions = "" } = await req.json();
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada");

    const systemPrompt = `Você é um designer de e-mail marketing especialista em HTML para clientes de e-mail (Gmail, Outlook, Apple Mail).

REGRAS OBRIGATÓRIAS:
- Retorne APENAS o HTML final, sem explicações, sem markdown, sem cercas de código.
- Use SEMPRE estilos inline (style="...") - NUNCA use <style> ou classes CSS.
- Largura máxima: 600px, centralizado com margin:0 auto.
- Fonte: Inter, Arial, sans-serif.
- Paleta da marca Liberty Pharma: dourado/âmbar (#b8860b, #d4a017), bege claro (#f5f1e8, #fff8e1), texto #1a1a1a.
- Inclua um cabeçalho com gradiente dourado e o nome "Liberty Pharma".
- Inclua um rodapé bege claro com texto pequeno e cinza.
- Use as variáveis {{nome}} e {{email}} de forma natural no corpo (não obrigatório, mas recomendado).
- Botão de ação (CTA) deve ser destacado em dourado, com padding generoso e border-radius 8px.
- NÃO inclua links de descadastro (são adicionados automaticamente).
- NÃO use <html>, <head> ou <body> - retorne apenas o conteúdo do e-mail (um <div> raiz é suficiente).
- O HTML deve renderizar corretamente em modo dark e light.
- Use emojis com moderação apenas se fizer sentido para o contexto.`;

    const userPrompt = `Gere um novo template de e-mail marketing com base nos dados abaixo.

ASSUNTO DO E-MAIL: "${subject || "(sem assunto definido)"}"

INSTRUÇÕES ADICIONAIS DO USUÁRIO: ${instructions || "(nenhuma)"}

HTML ATUAL DO EDITOR (use como referência de estilo e estrutura, mas crie uma nova versão melhorada):
\`\`\`html
${currentHtml || "(vazio)"}
\`\`\`

Gere uma NOVA versão criativa, profissional e visualmente atraente do e-mail, alinhada ao assunto. Use as variáveis {{nome}} e {{email}} quando fizer sentido. Retorne SOMENTE o HTML final.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Limite de requisições atingido. Tente em alguns segundos." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos no workspace." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`AI gateway falhou: ${response.status} ${txt.slice(0, 200)}`);
    }

    const data = await response.json();
    let html = data?.choices?.[0]?.message?.content?.trim() ?? "";
    // Remove cercas de código se vierem mesmo assim
    html = html.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "").trim();

    return new Response(JSON.stringify({ html }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[bulk-email-generate] erro:", e);
    return new Response(JSON.stringify({ error: e?.message || "Erro inesperado" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
