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
      const client = new SMTPClient({
        connection: {
          hostname: cfg.host,
          port: cfg.port,
          tls: useSsl,
          auth: { username: cfg.user, password: cfg.pass },
        },
        pool: false,
      });

      try {
        const headers: Record<string, string> = {
          "Message-ID": `<${messageId}@${cfg.host}>`,
        };
        if (input.correlationId) headers["X-Correlation-ID"] = input.correlationId;

        await client.send({
          from: input.from,
          to: input.to,
          replyTo: input.replyTo,
          subject: input.subject,
          content: input.text ?? "auto",
          html: input.html,
          headers,
        });
        try { await client.close(); } catch (_) { /* noop */ }

        const result: SendEmailSuccess = {
          ok: true,
          message_id: messageId,
          provider: "smtp",
          provider_status: 250,
          latency_ms: Date.now() - start,
        };
        log?.info("smtp_sent", {
          message_id: result.message_id,
          to_count: input.to.length,
          latency_ms: result.latency_ms,
        });
        return result;
      } catch (e) {
        try { await client.close(); } catch (_) { /* noop */ }
        const raw = maskSecretInMessage(
          e instanceof Error ? e.message : String(e),
          cfg.pass,
        );
        const classified = classifyEmailError(raw);
        const result: SendEmailFailure = {
          ok: false,
          message_id: messageId,
          provider: "smtp",
          provider_status: classified.smtp_code ?? 0,
          latency_ms: Date.now() - start,
          error: classified,
          raw_error: raw,
        };
        log?.error("smtp_failed", {
          message_id: messageId,
          to_count: input.to.length,
          latency_ms: result.latency_ms,
          category: classified.category,
          retryable: classified.retryable,
          smtp_code: classified.smtp_code,
          provider_error: raw,
        });
        return result;
      }
    },
  };
}