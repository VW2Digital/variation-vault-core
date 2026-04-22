// Backup semanal: gera ZIP com CSV de todas as tabelas principais e envia
// por email (com anexo) usando SMTP Hostinger (denomailer).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TABLES = [
  "addresses", "banner_slides", "banners", "cart_abandonment_logs", "cart_items",
  "coupon_products", "coupons", "orders", "payment_links", "payment_logs",
  "popups", "product_variations", "products", "profiles", "reviews",
  "shipping_logs", "site_settings", "support_messages", "support_tickets",
  "user_roles", "video_testimonials", "wholesale_prices",
];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function toCSV(rows: any[]): string {
  if (!rows || rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

function buildZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    localParts.push(local, file.data);
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);
    offset += local.length + file.data.length;
  }
  const centralSize = centralParts.reduce((a, b) => a + b.length, 0);
  const centralOffset = offset;
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralOffset, true);
  const total = offset + centralSize + 22;
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of localParts) { out.set(part, p); p += part.length; }
  for (const part of centralParts) { out.set(part, p); p += part.length; }
  out.set(end, p);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const files: { name: string; data: Uint8Array }[] = [];
    let totalRows = 0;
    for (const table of TABLES) {
      const { data, error } = await supabase.from(table as any).select("*");
      if (error) {
        console.error(`[backup] error reading ${table}:`, error.message);
        continue;
      }
      const csv = toCSV(data || []);
      files.push({ name: `${table}.csv`, data: new TextEncoder().encode(csv) });
      totalRows += (data || []).length;
    }

    const zipBytes = buildZip(files);
    const sizeMB = (zipBytes.length / 1024 / 1024).toFixed(2);
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `backup-liberty-pharma-${dateStr}.zip`;

    const { data: settings } = await supabase
      .from("site_settings")
      .select("key,value")
      .in("key", [
        "backup_recipient_email",
        "smtp_host", "smtp_port", "smtp_user", "smtp_pass",
        "smtp_from_email", "smtp_from_name", "smtp_secure",
        "store_name",
      ]);
    const m = new Map((settings || []).map((s: any) => [s.key, s.value]));
    const recipient = m.get("backup_recipient_email") || "libertyluminaepharma@gmail.com";

    const smtpHost = (m.get("smtp_host") || Deno.env.get("SMTP_HOST") || "").trim();
    const smtpPort = parseInt(m.get("smtp_port") || Deno.env.get("SMTP_PORT") || "465", 10);
    const smtpUser = (m.get("smtp_user") || Deno.env.get("SMTP_USER") || "").trim();
    const smtpPass = m.get("smtp_pass") || Deno.env.get("SMTP_PASS") || "";
    const smtpFromEmail = (m.get("smtp_from_email") || Deno.env.get("SMTP_FROM_EMAIL") || smtpUser).trim();
    const smtpFromName = (m.get("smtp_from_name") || Deno.env.get("SMTP_FROM_NAME") || "").trim();
    const smtpSecure = (m.get("smtp_secure") || Deno.env.get("SMTP_SECURE") || "").trim().toLowerCase();
    const storeName = m.get("store_name") || "Liberty Pharma";

    if (!smtpHost || !smtpUser || !smtpPass) {
      throw new Error("SMTP não configurado. Defina smtp_host/user/pass em Configurações → Comunicação.");
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #b8860b;">Backup Semanal - ${storeName}</h2>
        <p>Olá,</p>
        <p>Segue em anexo o backup completo do banco de dados gerado automaticamente.</p>
        <ul>
          <li><strong>Data:</strong> ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</li>
          <li><strong>Tabelas:</strong> ${files.length}</li>
          <li><strong>Total de registros:</strong> ${totalRows.toLocaleString("pt-BR")}</li>
          <li><strong>Tamanho do ZIP:</strong> ${sizeMB} MB</li>
        </ul>
        <p style="color: #666; font-size: 12px; margin-top: 24px;">
          Email automático enviado pelo sistema. Para alterar o destinatário, acesse o painel administrativo.
        </p>
      </div>
    `;

    const useSsl = smtpSecure === "ssl" || smtpPort === 465;
    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: smtpPort,
        tls: useSsl,
        auth: { username: smtpUser, password: smtpPass },
      },
      pool: false,
    });

    const fromHeader = smtpFromName
      ? `${smtpFromName} <${smtpFromEmail || smtpUser}>`
      : `${storeName} <${smtpFromEmail || smtpUser}>`;

    try {
      await client.send({
        from: fromHeader,
        to: [recipient],
        subject: `Backup Semanal - ${dateStr} (${sizeMB} MB)`,
        content: "auto",
        html,
        attachments: [{
          filename,
          contentType: "application/zip",
          encoding: "binary",
          content: zipBytes,
        }],
      });
      await client.close();
    } catch (e: any) {
      try { await client.close(); } catch (_) { /* noop */ }
      let msg = e?.message || String(e);
      if (smtpPass && msg) msg = msg.split(smtpPass).join("***");
      throw new Error(`SMTP failed: ${msg}`);
    }

    console.log(`[backup] Sent ${filename} (${sizeMB}MB) to ${recipient}`);

    return new Response(
      JSON.stringify({ success: true, filename, sizeMB, totalRows, tables: files.length, recipient, provider: "smtp" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[backup-weekly-email] error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
