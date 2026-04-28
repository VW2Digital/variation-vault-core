// Biblioteca de templates HTML para disparos em massa.
// Variáveis suportadas: {{nome}} e {{email}}
// Estilo inline (compatível com clientes de e-mail).

export type BulkEmailTemplate = {
  id: string;
  name: string;
  category: "Boas-vindas" | "Promocional" | "Reengajamento" | "Anúncio" | "Conteúdo" | "Datas Comemorativas";
  description: string;
  subject: string;
  html: string;
};

const wrapper = (inner: string) => `<div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;color:#1a1a1a;line-height:1.6;">
  <div style="background:linear-gradient(135deg,#b8860b,#d4a017);padding:24px;text-align:center;">
    <h1 style="color:#ffffff;margin:0;font-size:22px;letter-spacing:.5px;">Liberty Pharma</h1>
  </div>
  <div style="padding:32px 24px;">
${inner}
  </div>
  <div style="background:#f5f1e8;padding:18px 24px;text-align:center;font-size:12px;color:#7a6a4f;">
    Liberty Pharma — Saúde e bem-estar com responsabilidade.<br/>
    Você está recebendo este e-mail por ser um cliente cadastrado.
  </div>
</div>`;

const button = (label: string, href: string) =>
  `<div style="text-align:center;margin:28px 0;"><a href="${href}" style="background:#b8860b;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">${label}</a></div>`;

export const BULK_EMAIL_TEMPLATES: BulkEmailTemplate[] = [
  {
    id: "welcome",
    name: "Boas-vindas",
    category: "Boas-vindas",
    description: "Mensagem para clientes recém-cadastrados.",
    subject: "Bem-vindo(a) à Liberty Pharma, {{nome}}!",
    html: wrapper(`<h2 style="color:#b8860b;margin-top:0;">Olá, {{nome}}!</h2>
<p>É um prazer ter você com a gente. Na <strong>Liberty Pharma</strong> você encontra produtos de qualidade farmacêutica com atendimento personalizado.</p>
<p>Aproveite para conhecer nosso catálogo completo:</p>
${button("Ver catálogo", "https://libertypharma.com.br")}
<p style="font-size:14px;color:#666;">Qualquer dúvida, é só responder este e-mail.</p>`),
  },
  {
    id: "promo_discount",
    name: "Promoção com cupom",
    category: "Promocional",
    description: "Anúncio de desconto com cupom destacado.",
    subject: "{{nome}}, seu cupom exclusivo está aqui",
    html: wrapper(`<h2 style="color:#b8860b;margin-top:0;">Oferta especial para você, {{nome}}</h2>
<p>Aproveite <strong>15% de desconto</strong> em toda a loja usando o cupom abaixo:</p>
<div style="background:#fff8e1;border:2px dashed #b8860b;padding:20px;text-align:center;border-radius:8px;margin:24px 0;">
  <div style="font-size:12px;color:#7a6a4f;">CUPOM</div>
  <div style="font-size:28px;font-weight:bold;color:#b8860b;letter-spacing:2px;">LIBERTY15</div>
</div>
<p>Válido por tempo limitado. Não perca!</p>
${button("Aproveitar agora", "https://libertypharma.com.br")}`),
  },
  {
    id: "promo_freeshipping",
    name: "Frete grátis",
    category: "Promocional",
    description: "Campanha de frete grátis.",
    subject: "Frete grátis liberado para você, {{nome}}!",
    html: wrapper(`<h2 style="color:#b8860b;margin-top:0;">Frete grátis para todo o Brasil</h2>
<p>Olá {{nome}}, liberamos <strong>frete grátis</strong> em compras acima de R$ 199 por tempo limitado.</p>
<p>Aproveite para repor seu estoque ou experimentar produtos novos.</p>
${button("Comprar com frete grátis", "https://libertypharma.com.br")}
<p style="font-size:13px;color:#666;text-align:center;">Promoção válida até o fim da semana.</p>`),
  },
  {
    id: "new_product",
    name: "Lançamento de produto",
    category: "Anúncio",
    description: "Anúncio de produto novo no catálogo.",
    subject: "Novidade na Liberty Pharma! 🚀",
    html: wrapper(`<h2 style="color:#b8860b;margin-top:0;">Novo produto disponível</h2>
<p>Olá {{nome}}, temos uma novidade que vai te interessar.</p>
<p>Acabamos de adicionar um novo produto ao nosso catálogo, com qualidade comprovada e estoque limitado.</p>
<p><strong>Seja um dos primeiros a experimentar!</strong></p>
${button("Ver lançamento", "https://libertypharma.com.br")}`),
  },
  {
    id: "reengagement",
    name: "Sentimos sua falta",
    category: "Reengajamento",
    description: "Reativar clientes inativos.",
    subject: "{{nome}}, sentimos sua falta!",
    html: wrapper(`<h2 style="color:#b8860b;margin-top:0;">Faz tempo que não nos vemos, {{nome}}</h2>
<p>Notamos que você não passou pela nossa loja há algum tempo. Que tal dar uma olhada nas novidades?</p>
<p>Preparamos um <strong>cupom especial de retorno</strong>:</p>
<div style="background:#fff8e1;border:2px dashed #b8860b;padding:18px;text-align:center;border-radius:8px;margin:20px 0;">
  <div style="font-size:24px;font-weight:bold;color:#b8860b;letter-spacing:2px;">VOLTEI10</div>
  <div style="font-size:12px;color:#7a6a4f;">10% off em qualquer pedido</div>
</div>
${button("Voltar a comprar", "https://libertypharma.com.br")}`),
  },
  {
    id: "abandoned_general",
    name: "Lembrete de carrinho",
    category: "Reengajamento",
    description: "Lembrar de finalizar uma compra.",
    subject: "Você esqueceu algo no carrinho, {{nome}}",
    html: wrapper(`<h2 style="color:#b8860b;margin-top:0;">Seu carrinho está esperando</h2>
<p>Oi {{nome}}, percebemos que você deixou itens selecionados na nossa loja.</p>
<p>Eles ainda estão disponíveis, mas o estoque é limitado. Finalize seu pedido com tranquilidade:</p>
${button("Finalizar compra", "https://libertypharma.com.br")}
<p style="font-size:13px;color:#666;">Precisa de ajuda? É só responder este e-mail.</p>`),
  },
  {
    id: "tips_health",
    name: "Dicas de saúde",
    category: "Conteúdo",
    description: "Conteúdo educativo sobre saúde.",
    subject: "Dicas de saúde para começar bem a semana",
    html: wrapper(`<h2 style="color:#b8860b;margin-top:0;">5 dicas para uma rotina mais saudável</h2>
<p>Olá {{nome}}, separamos algumas práticas simples que fazem diferença no dia a dia:</p>
<ol style="padding-left:20px;color:#333;">
  <li><strong>Hidratação:</strong> beba ao menos 2 litros de água por dia.</li>
  <li><strong>Sono de qualidade:</strong> mantenha horários regulares.</li>
  <li><strong>Alimentação balanceada:</strong> priorize alimentos naturais.</li>
  <li><strong>Movimento:</strong> caminhe ao menos 30 minutos diários.</li>
  <li><strong>Suplementação consciente:</strong> com orientação profissional.</li>
</ol>
${button("Ver produtos para sua saúde", "https://libertypharma.com.br")}`),
  },
  {
    id: "blackfriday",
    name: "Black Friday",
    category: "Datas Comemorativas",
    description: "Campanha de Black Friday.",
    subject: "🖤 Black Friday Liberty Pharma — descontos de até 50%",
    html: wrapper(`<div style="background:#000;color:#fff;text-align:center;padding:30px;border-radius:8px;margin-bottom:20px;">
  <h1 style="margin:0;font-size:36px;letter-spacing:4px;">BLACK FRIDAY</h1>
  <p style="margin:8px 0 0;font-size:18px;color:#d4a017;">Até 50% OFF</p>
</div>
<p>Olá {{nome}}, chegou a maior promoção do ano!</p>
<p>Descontos imperdíveis em produtos selecionados, estoque limitado.</p>
${button("Aproveitar Black Friday", "https://libertypharma.com.br")}`),
  },
  {
    id: "christmas",
    name: "Natal",
    category: "Datas Comemorativas",
    description: "Mensagem natalina.",
    subject: "Feliz Natal, {{nome}}! 🎄",
    html: wrapper(`<h2 style="color:#b8860b;margin-top:0;">Feliz Natal, {{nome}}!</h2>
<p>Toda a equipe da Liberty Pharma deseja a você e sua família um Natal repleto de saúde, paz e momentos especiais.</p>
<p>Obrigado por fazer parte da nossa história em 2024.</p>
<p style="text-align:center;font-size:48px;margin:20px 0;">🎄</p>
<p style="text-align:center;font-style:italic;color:#666;">"A maior das bênçãos é a saúde."</p>
${button("Conhecer kits de presente", "https://libertypharma.com.br")}`),
  },
  {
    id: "newyear",
    name: "Ano Novo",
    category: "Datas Comemorativas",
    description: "Mensagem de Ano Novo.",
    subject: "Feliz Ano Novo, {{nome}}!",
    html: wrapper(`<h2 style="color:#b8860b;margin-top:0;">Que venha um novo ciclo, {{nome}}!</h2>
<p>Que o próximo ano seja repleto de conquistas, saúde e bem-estar para você e sua família.</p>
<p>Estamos juntos em mais um ano de cuidado e qualidade.</p>
<p style="text-align:center;font-size:48px;margin:20px 0;">🎆</p>
${button("Começar bem o ano", "https://libertypharma.com.br")}`),
  },
  {
    id: "mothers_day",
    name: "Dia das Mães",
    category: "Datas Comemorativas",
    description: "Campanha do Dia das Mães.",
    subject: "Para a saúde de quem você ama",
    html: wrapper(`<h2 style="color:#b8860b;margin-top:0;">Dia das Mães é na Liberty Pharma</h2>
<p>Olá {{nome}}, presentear com saúde é demonstrar amor verdadeiro.</p>
<p>Selecionamos produtos perfeitos para o cuidado de quem mais importa.</p>
${button("Ver sugestões de presente", "https://libertypharma.com.br")}`),
  },
  {
    id: "survey",
    name: "Pesquisa de satisfação",
    category: "Conteúdo",
    description: "Convite para responder pesquisa.",
    subject: "{{nome}}, sua opinião vale muito para nós",
    html: wrapper(`<h2 style="color:#b8860b;margin-top:0;">Pode nos ajudar, {{nome}}?</h2>
<p>Estamos sempre buscando melhorar a experiência dos nossos clientes.</p>
<p>Se puder dedicar 2 minutos para responder algumas perguntas, ficaremos muito gratos.</p>
${button("Responder pesquisa", "https://libertypharma.com.br")}
<p style="font-size:13px;color:#666;">Sua resposta é anônima e ajuda muito a nossa equipe.</p>`),
  },
  {
    id: "blank_minimal",
    name: "Em branco (minimalista)",
    category: "Conteúdo",
    description: "Modelo em branco com cabeçalho da marca.",
    subject: "",
    html: wrapper(`<h2 style="color:#b8860b;margin-top:0;">Olá, {{nome}}</h2>
<p>Escreva aqui o conteúdo da sua mensagem.</p>
<p>Atenciosamente,<br/>Equipe Liberty Pharma</p>`),
  },
];
