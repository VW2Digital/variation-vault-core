import { z } from "zod";

export type ValidationIssue = {
  level: "error" | "warning";
  code: string;
  message: string;
};

// Zod: limites duros
export const BulkEmailSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(3, "Assunto muito curto (mínimo 3 caracteres).")
    .max(150, "Assunto muito longo (máximo 150 caracteres)."),
  html: z
    .string()
    .trim()
    .min(20, "Conteúdo HTML muito curto.")
    .max(102_400, "Conteúdo HTML excede 100KB — Gmail corta mensagens > ~102KB."),
});

// Palavras/expressões com alta correlação a spam (português + inglês)
const SPAM_TRIGGERS = [
  "ganhe dinheiro", "clique aqui agora", "100% grátis", "100% gratis",
  "renda extra", "promoção imperdível", "promocao imperdivel",
  "última chance", "ultima chance", "compre já", "compre ja",
  "viagra", "cassino", "casino", "loteria", "milionário", "milionario",
  "free!!!", "act now", "buy now", "limited time", "no risk",
  "click here", "earn money", "guaranteed", "risk free",
];

const SUSPICIOUS_TAGS = [/<script\b/i, /<iframe\b/i, /<object\b/i, /<embed\b/i, /<form\b/i];

// Heurísticas para reduzir falhas de entrega
export function analyzeBulkEmail(subject: string, html: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const subj = subject.trim();
  const body = html.trim();

  // === ASSUNTO ===
  if (subj.length > 70) {
    issues.push({
      level: "warning",
      code: "subject_too_long",
      message: `Assunto com ${subj.length} caracteres — clientes de e-mail truncam acima de ~70.`,
    });
  }
  // Mais de 70% de letras maiúsculas
  const letters = subj.replace(/[^a-zA-Zà-úÀ-Ú]/g, "");
  if (letters.length >= 6) {
    const upper = (subj.match(/[A-ZÀ-Ú]/g) || []).length;
    if (upper / letters.length > 0.7) {
      issues.push({
        level: "warning",
        code: "subject_caps",
        message: "Assunto com excesso de MAIÚSCULAS — filtros antispam penalizam.",
      });
    }
  }
  // Excesso de pontuação ou emojis no assunto
  if (/[!?]{3,}/.test(subj) || (subj.match(/[!?]/g) || []).length > 3) {
    issues.push({
      level: "warning",
      code: "subject_punctuation",
      message: "Excesso de '!' ou '?' no assunto. Remova para melhorar entregabilidade.",
    });
  }
  // Símbolos de moeda repetidos
  if (/(\$\$|R\$ ?\d+ ?(grátis|gratis))/i.test(subj)) {
    issues.push({
      level: "warning",
      code: "subject_money",
      message: "Assunto contém termos financeiros agressivos (ex: 'R$ grátis').",
    });
  }
  // Variável não substituída deixada por engano
  if (/\{\{\s*\w+\s*\}\}/.test(subj)) {
    const known = /\{\{\s*(nome|email)\s*\}\}/gi;
    const cleaned = subj.replace(known, "");
    if (/\{\{\s*\w+\s*\}\}/.test(cleaned)) {
      issues.push({
        level: "error",
        code: "subject_unknown_var",
        message: "Assunto contém variável não suportada (apenas {{nome}} e {{email}}).",
      });
    }
  }

  // === HTML ===
  // Tamanho
  const sizeKB = new Blob([body]).size / 1024;
  if (sizeKB > 80 && sizeKB <= 100) {
    issues.push({
      level: "warning",
      code: "html_size_warn",
      message: `HTML com ${sizeKB.toFixed(1)}KB — perto do limite de 102KB do Gmail (causa "[Mensagem cortada]").`,
    });
  }

  // Tags suspeitas (bloqueadas por clientes de e-mail)
  for (const tag of SUSPICIOUS_TAGS) {
    if (tag.test(body)) {
      issues.push({
        level: "error",
        code: "unsafe_tag",
        message: `Tag não suportada por clientes de e-mail detectada: ${tag.source.replace(/\\b/g, "")}. Será removida ou bloqueada.`,
      });
    }
  }

  // CSS externo / <style>
  if (/<link\b[^>]+stylesheet/i.test(body)) {
    issues.push({
      level: "error",
      code: "external_css",
      message: "CSS externo (<link rel='stylesheet'>) não funciona em e-mail. Use estilos inline.",
    });
  }
  if (/<style\b/i.test(body)) {
    issues.push({
      level: "warning",
      code: "style_block",
      message: "<style> tem suporte limitado (Gmail/Outlook ignoram em vários casos). Prefira style inline.",
    });
  }

  // Falta de texto alternativo em imagens
  const imgs = body.match(/<img\b[^>]*>/gi) || [];
  const imgsSemAlt = imgs.filter((img) => !/\balt\s*=/.test(img)).length;
  if (imgsSemAlt > 0) {
    issues.push({
      level: "warning",
      code: "img_no_alt",
      message: `${imgsSemAlt} imagem(ns) sem atributo alt — Gmail bloqueia imagens por padrão.`,
    });
  }

  // URLs encurtadas (bit.ly, tinyurl, etc.) — alto risco
  const shorteners = (body.match(/\bhttps?:\/\/(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd)\//gi) || []).length;
  if (shorteners > 0) {
    issues.push({
      level: "warning",
      code: "url_shortener",
      message: `${shorteners} link(s) encurtado(s) detectado(s) — filtros antispam penalizam fortemente.`,
    });
  }

  // Razão imagem/texto (heurística)
  const text = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (text.length < 80 && imgs.length > 0) {
    issues.push({
      level: "warning",
      code: "image_heavy",
      message: "E-mail majoritariamente composto por imagens. Adicione texto para melhorar entregabilidade.",
    });
  }
  if (text.length < 30) {
    issues.push({
      level: "error",
      code: "text_too_short",
      message: "Conteúdo de texto extremamente curto. E-mails sem texto vão para spam.",
    });
  }

  // Variáveis não suportadas no corpo
  const allVars = body.match(/\{\{\s*\w+\s*\}\}/g) || [];
  const unsupported = allVars.filter((v) => !/\{\{\s*(nome|email)\s*\}\}/i.test(v));
  if (unsupported.length > 0) {
    const uniq = Array.from(new Set(unsupported));
    issues.push({
      level: "error",
      code: "unsupported_var",
      message: `Variável(eis) não suportada(s): ${uniq.join(", ")}. Apenas {{nome}} e {{email}} funcionam.`,
    });
  }

  // Palavras-gatilho de spam
  const lowerAll = (subj + " " + text).toLowerCase();
  const matchedTriggers = SPAM_TRIGGERS.filter((kw) => lowerAll.includes(kw));
  if (matchedTriggers.length > 0) {
    issues.push({
      level: "warning",
      code: "spam_words",
      message: `Termo(s) com alta pontuação de spam: "${matchedTriggers.slice(0, 3).join('", "')}". Reescreva.`,
    });
  }

  // Sem link de cancelamento? (apenas aviso — backend pode adicionar automaticamente)
  if (!/unsubscribe|descadastr|cancelar inscri/i.test(body)) {
    issues.push({
      level: "warning",
      code: "no_unsubscribe",
      message: "Nenhum link de descadastro encontrado. CAN-SPAM/LGPD recomendam fortemente.",
    });
  }

  return issues;
}
