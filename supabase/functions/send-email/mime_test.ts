import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { encodeMimeSubject, sanitizeEmailHtml, sanitizeEmailText } from "../_shared/mime.ts";

Deno.test("normaliza assunto quoted-printable quebrado para UTF-8 e encoded-word", () => {
  assertEquals(
    encodeMimeSubject("u=c3=a1rios de Tirze + B=c3=b4nus?="),
    "=?UTF-8?Q?Usu=C3=A1rios_de_Tirze_+_B=C3=B4nus?=",
  );
});

Deno.test("decodifica quoted-printable em text/plain e remove headers MIME copiados", () => {
  const text = sanitizeEmailText(`Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: quoted-printable

Ol=c3=a1, usu=c3=a1rios. Pagamento n=c3=a3o aprovado. Este =c3=a9 um email autom=c3=a1tico.`);

  assertEquals(text, "Olá, usuários. Pagamento não aprovado. Este é um email automático.");
});

Deno.test("decodifica quoted-printable em HTML sem preservar boundary bruto", () => {
  const html = sanitizeEmailHtml(`--abc123boundary
Content-Type: text/html; charset=UTF-8
Content-Transfer-Encoding: quoted-printable

<p>Ol=c3=a1 Liberty e Lumina</p><strong>B=c3=b4nus</strong>
--abc123boundary--`);

  assertStringIncludes(html, "Olá Liberty e Lumina");
  assertStringIncludes(html, "Bônus");
  assertEquals(/=c3=|Content-Transfer-Encoding|Content-Type|boundary/i.test(html), false);
});