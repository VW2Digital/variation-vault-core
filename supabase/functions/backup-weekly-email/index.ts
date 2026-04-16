import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

// CRC32 implementation for ZIP
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

    // Local file header
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version
    lv.setUint16(6, 0, true);  // flags
    lv.setUint16(8, 0, true);  // method = stored
    lv.setUint16(10, 0, true); // time
    lv.setUint16(12, 0, true); // date
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    localParts.push(local, file.data);

    // Central directory header
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

  // End of central directory
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

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Build ZIP with all tables
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

    // Get recipient + sender from site_settings
    const { data: settings } = await supabase
      .from("site_settings")
      .select("key,value")
      .in("key", ["backup_recipient_email", "backup_email_from"]);
    const settingsMap = new Map((settings || []).map((s: any) => [s.key, s.value]));
    const recipient = settingsMap.get("backup_recipient_email") || "libertyluminaepharma@gmail.com";
    // Default to Resend's test sender (no domain verification needed).
    // NOTE: with onboarding@resend.dev, Resend only allows sending to the Resend account owner's email.
    const fromAddress = settingsMap.get("backup_email_from") || "Liberty Pharma Backup <onboarding@resend.dev>";

    // Send via Resend
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #b8860b;">Backup Semanal - Liberty Pharma</h2>
        <p>Olá,</p>
        <p>Segue em anexo o backup completo do banco de dados gerado automaticamente.</p>
        <ul>
          <li><strong>Data:</strong> ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</li>
          <li><strong>Tabelas:</strong> ${files.length}</li>
          <li><strong>Total de registros:</strong> ${totalRows.toLocaleString("pt-BR")}</li>
          <li><strong>Tamanho do ZIP:</strong> ${sizeMB} MB</li>
        </ul>
        <p style="color: #666; font-size: 12px; margin-top: 24px;">
          Email automático enviado pelo sistema. Para alterar o destinatário ou desativar, acesse o painel administrativo.
        </p>
      </div>
    `;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [recipient],
        subject: `Backup Semanal - ${dateStr} (${sizeMB} MB)`,
        html,
        attachments: [{ filename, content: uint8ToBase64(zipBytes) }],
      }),
    });

    const resendData = await resendRes.json();
    if (!resendRes.ok) {
      console.error("[backup] Resend error:", resendData);
      throw new Error(`Resend failed: ${JSON.stringify(resendData)}`);
    }

    console.log(`[backup] Sent ${filename} (${sizeMB}MB) to ${recipient}`);

    return new Response(
      JSON.stringify({ success: true, filename, sizeMB, totalRows, tables: files.length, recipient, resendId: resendData.id }),
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
