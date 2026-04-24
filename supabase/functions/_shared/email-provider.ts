// Pluggable email provider layer.
// Today only the SMTP provider exists (Hostinger / generic), but the shape
// is kept abstract so a future Resend/SES/Mailgun adapter can be added
// without touching the call sites.
//
// All sends:
//   - generate a deterministic message_id when one is not supplied,
//   - propagate the correlation id via X-Correlation-ID header,
//   - return a structured result (success or classified error),
//   - never throw to the caller — the caller decides how to log/persist.

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import {
  classifyEmailError,
  type ClassifiedEmailError,
  maskSecretInMessage,
} from "./email-errors.ts";
import type { Logger } from "./logger.ts";
import { withRetry } from "./retry.ts";

/**
 * Strip HTML tags + entidades comuns para gerar fallback text/plain.
 * Usado quando o caller não envia `text` explícito.
 */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<br\s*\/?>(\s*)/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanEmailMarkup(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/^\s+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface SendEmailInput {
  from: string;          // "Name <addr@host>"
  replyTo?: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  /** Deterministic id; if omitted the provider generates one. */
  messageId?: string;
  /** Optional correlation id, sent as X-Correlation-ID header. */
  correlationId?: string;
}

export interface SendEmailSuccess {
  ok: true;
  message_id: string;
  provider: string;
  provider_status: number;
  latency_ms: number;
}

export interface SendEmailFailure {
  ok: false;
  message_id: string | null;
  provider: string;
  provider_status: number;
  latency_ms: number;
  error: ClassifiedEmailError;
  raw_error: string;
  /** Número total de tentativas executadas (inclui a primeira). */
  attempts?: number;
}

export type SendEmailResult = SendEmailSuccess | SendEmailFailure;

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  /** "ssl" | "tls" | "" — when empty, port decides (465 = SSL). */
  secure?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(input: SendEmailInput, log?: Logger): Promise<SendEmailResult>;
}

/** SMTP provider built on denomailer. */
export function createSmtpProvider(cfg: SmtpConfig): EmailProvider {
  const useSsl = cfg.secure === "ssl" || cfg.port === 465;
  return {
    name: "smtp",
    async send(input, log) {
      const start = Date.now();
      const messageId = input.messageId ?? `smtp-${crypto.randomUUID()}`;

      // Tentativa única — invocada a cada round pelo `withRetry`.
      const attemptOnce = async (): Promise<SendEmailResult> => {
        const cleanedHtml = cleanEmailMarkup(input.html);
        const cleanedText = input.text && input.text.trim().length > 0
          ? cleanEmailMarkup(input.text)
          : htmlToPlainText(cleanedHtml);

        const client = new SMTPClient({
          connection: {
            hostname: cfg.host,
            port: cfg.port,
            tls: useSsl,
            auth: { username: cfg.user, password: cfg.pass },
          },
          pool: false,
          debug: {
            log: false,
            allowUnsecure: false,
            encodeLB: true,
            noStartTLS: false,
          },
        });
        try {
          const headers: Record<string, string> = {
            "Message-ID": `<${messageId}@${cfg.host}>`,
          };
          if (input.correlationId) headers["X-Correlation-ID"] = input.correlationId;

          // Gera versão texto a partir do HTML.
          await client.send({
            from: input.from,
            to: input.to,
            replyTo: input.replyTo,
            subject: input.subject,
            content: cleanedText,
            html: cleanedHtml,
            headers,
          });
          try { await client.close(); } catch (_) { /* noop */ }

          return {
            ok: true,
            message_id: messageId,
            provider: "smtp",
            provider_status: 250,
            latency_ms: Date.now() - start,
          } as SendEmailSuccess;
        } catch (e) {
          try { await client.close(); } catch (_) { /* noop */ }
          const raw = maskSecretInMessage(
            e instanceof Error ? e.message : String(e),
            cfg.pass,
          );
          const classified = classifyEmailError(raw);
          return {
            ok: false,
            message_id: messageId,
            provider: "smtp",
            provider_status: classified.smtp_code ?? 0,
            latency_ms: Date.now() - start,
            error: classified,
            raw_error: raw,
          } as SendEmailFailure;
        }
      };

      // Retry com backoff exponencial + jitter — só para falhas classificadas
      // como retryable (ex.: rate_limited, connection_failed, tls_failed).
      const retried = await withRetry<SendEmailResult>(
        () => attemptOnce(),
        {
          maxAttempts: 3,
          baseDelayMs: 500,
          maxDelayMs: 4000,
          isRetryable: (r) => !r.ok && r.error.retryable === true,
          isRetryableError: () => true, // exceções inesperadas → retry
          log,
          label: "smtp_send",
        },
      );

      const final = retried.result as SendEmailResult | null;
      if (final && final.ok) {
        log?.info("smtp_sent", {
          message_id: final.message_id,
          to_count: input.to.length,
          latency_ms: final.latency_ms,
          attempts: retried.attempts,
        });
        return final;
      }

      // Falha definitiva — pega o último resultado (ou monta um genérico).
      const failure: SendEmailFailure = (final && !final.ok)
        ? { ...final, attempts: retried.attempts }
        : {
            ok: false,
            message_id: messageId,
            provider: "smtp",
            provider_status: 0,
            latency_ms: Date.now() - start,
            error: classifyEmailError(retried.error ?? "unknown"),
            raw_error: retried.error instanceof Error
              ? retried.error.message
              : String(retried.error ?? "unknown"),
            attempts: retried.attempts,
          };

      log?.error("smtp_failed", {
        message_id: failure.message_id,
        to_count: input.to.length,
        latency_ms: failure.latency_ms,
        attempts: failure.attempts,
        category: failure.error.category,
        retryable: failure.error.retryable,
        smtp_code: failure.error.smtp_code,
        provider_error: failure.raw_error,
      });
      return failure;
    },
  };
}