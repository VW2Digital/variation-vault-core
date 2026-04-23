// Classifier for SMTP / email-delivery failures.
// Maps raw provider strings (Hostinger, Gmail, Outlook, generic SMTP, ...)
// into a stable taxonomy so we can:
//   - decide retry vs. give-up,
//   - persist a normalized status in `email_send_log`,
//   - return a friendly error to the caller without leaking internals,
//   - detect spam / blocklist signals early.
//
// Keep this file pure (no Deno APIs) so it can be unit-tested with Deno test.

export type EmailErrorCategory =
  | "auth_failed"          // 535/534 — wrong username or password
  | "invalid_recipient"    // 550/553 — mailbox not found / not allowed
  | "rate_limited"         // 421/450/452 — temporary throttling
  | "blocked_spam"         // 550 with SPF/DKIM/DMARC/spam signals
  | "blocklisted_ip"       // sender IP on RBL / Spamhaus / etc.
  | "tls_failed"           // STARTTLS / SSL handshake error
  | "connection_failed"    // network unreachable / DNS / timeout
  | "message_too_large"    // 552 — message size exceeded
  | "policy_rejected"      // generic 5xx policy / content rejection
  | "transient"            // generic 4xx — safe to retry
  | "unknown";

export interface ClassifiedEmailError {
  category: EmailErrorCategory;
  retryable: boolean;
  /** Friendly message in Portuguese, safe to surface to admins. */
  friendly: string;
  /** Raw SMTP code if we could parse one (e.g. 535, 550, 421). */
  smtp_code: number | null;
}

const SPAM_HINTS = [
  "spam",
  "spf",
  "dkim",
  "dmarc",
  "blacklist",
  "blocklist",
  "spamhaus",
  "barracuda",
  "policy",
  "reputation",
  "bulk mail",
  "junk",
  "550 5.7",
  "554 5.7",
  "rejected as spam",
  "message looks like spam",
];

function extractSmtpCode(raw: string): number | null {
  const m = raw.match(/\b(4\d{2}|5\d{2})\b/);
  if (!m) return null;
  const code = Number(m[1]);
  return Number.isFinite(code) ? code : null;
}

export function classifyEmailError(
  err: unknown,
  ctx: { provider_status?: number } = {},
): ClassifiedEmailError {
  const raw = (err instanceof Error ? err.message : String(err ?? "")).trim();
  const lower = raw.toLowerCase();
  const code = ctx.provider_status || extractSmtpCode(raw);

  // Spam / reputation signals win over generic 5xx classification.
  if (SPAM_HINTS.some((h) => lower.includes(h))) {
    const blocklisted =
      lower.includes("blacklist") ||
      lower.includes("blocklist") ||
      lower.includes("spamhaus") ||
      lower.includes("rbl");
    return {
      category: blocklisted ? "blocklisted_ip" : "blocked_spam",
      retryable: false,
      friendly: blocklisted
        ? "IP do remetente está em uma lista de bloqueio anti-spam. Verifique reputação do servidor SMTP."
        : "Mensagem rejeitada como spam pelo destinatário. Confirme SPF, DKIM e DMARC do domínio.",
      smtp_code: code,
    };
  }

  if (lower.includes("authentication") || lower.includes("auth ") || code === 535 || code === 534) {
    return {
      category: "auth_failed",
      retryable: false,
      friendly:
        "Credenciais SMTP inválidas. Revise smtp_user / smtp_pass em Configurações → Comunicação.",
      smtp_code: code,
    };
  }

  if (lower.includes("tls") || lower.includes("ssl") || lower.includes("handshake") || lower.includes("certificate")) {
    return {
      category: "tls_failed",
      retryable: true,
      friendly:
        "Falha de TLS/SSL com o servidor SMTP. Verifique a porta (465=SSL, 587=STARTTLS) e o host.",
      smtp_code: code,
    };
  }

  if (
    lower.includes("timeout") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("network") ||
    lower.includes("getaddrinfo")
  ) {
    return {
      category: "connection_failed",
      retryable: true,
      friendly: "Não foi possível conectar ao servidor SMTP (rede / DNS / timeout).",
      smtp_code: code,
    };
  }

  if (code === 552 || lower.includes("message size") || lower.includes("too large")) {
    return {
      category: "message_too_large",
      retryable: false,
      friendly: "Mensagem excede o tamanho máximo permitido pelo servidor SMTP.",
      smtp_code: code,
    };
  }

  if (code === 550 || code === 553 || lower.includes("mailbox") || lower.includes("recipient")) {
    return {
      category: "invalid_recipient",
      retryable: false,
      friendly: "Endereço de destinatário inválido ou rejeitado pelo servidor.",
      smtp_code: code,
    };
  }

  if (code === 421 || code === 450 || code === 452 || lower.includes("rate") || lower.includes("too many")) {
    return {
      category: "rate_limited",
      retryable: true,
      friendly: "Servidor SMTP aplicou limite de envio. Tente novamente em alguns minutos.",
      smtp_code: code,
    };
  }

  if (code && code >= 500 && code < 600) {
    return {
      category: "policy_rejected",
      retryable: false,
      friendly: "Servidor SMTP rejeitou o envio por política. Veja o log para detalhes técnicos.",
      smtp_code: code,
    };
  }

  if (code && code >= 400 && code < 500) {
    return {
      category: "transient",
      retryable: true,
      friendly: "Falha temporária no envio. Pode ser tentado novamente.",
      smtp_code: code,
    };
  }

  return {
    category: "unknown",
    retryable: true,
    friendly: "Erro desconhecido ao enviar email. Veja o log de envio para detalhes.",
    smtp_code: code,
  };
}

/** Removes SMTP password from any error message before logging. */
export function maskSecretInMessage(message: string, secret: string | undefined): string {
  if (!message || !secret) return message;
  return message.split(secret).join("***");
}