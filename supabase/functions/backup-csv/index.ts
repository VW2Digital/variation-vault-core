import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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

// CSV helpers
const csvEscape = (val: unknown): string => {
  if (val === null || val === undefined) return "";
  const str = typeof val === "object" ? JSON.stringify(val) : String(val);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
};

const toCSV = (rows: Record<string, unknown>[]): string => {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const header = cols.join(",");
  const body = rows.map((r) => cols.map((c) => csvEscape(r[c])).join(",")).join("\n");
  return `${header}\n${body}`;
};

const parseCSV = (text: string): Record<string, string>[] => {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { cur.push(field); field = ""; }
      else if (ch === "\n" || ch === "\r") {
        // Handle \r\n by skipping the \n that follows \r
        if (ch === "\r" && text[i + 1] === "\n") i++;
        cur.push(field); rows.push(cur); cur = []; field = "";
      }
      else field += ch;
    }
  }
  // Flush trailing line (file may not end with newline)
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1)
    // Drop fully empty trailing rows but keep partial rows (pad with empty)
    .filter(r => !(r.length === 1 && r[0] === ""))
    .map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => { obj[h] = r[idx] ?? ""; });
      return obj;
    });
};

// Coerce CSV string values back to proper types for Postgres
const coerceValue = (val: string): unknown => {
  if (val === "" || val === null) return null;
  if (val === "true") return true;
  if (val === "false") return false;
  // Try JSON (objects/arrays)
  if ((val.startsWith("{") && val.endsWith("}")) || (val.startsWith("[") && val.endsWith("]"))) {
    try { return JSON.parse(val); } catch { /* keep as string */ }
  }
  return val;
};

// Minimal ZIP writer (store, no compression) — enough for CSV bundle
const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  return table;
})();

const crc32 = (data: Uint8Array): number => {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) crc = crc32Table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
};

const buildZip = (files: { name: string; data: Uint8Array }[]): Uint8Array => {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lhView = new DataView(localHeader.buffer);
    lhView.setUint32(0, 0x04034b50, true);
    lhView.setUint16(4, 20, true);
    lhView.setUint16(6, 0, true);
    lhView.setUint16(8, 0, true);
    lhView.setUint16(10, 0, true);
    lhView.setUint16(12, 0, true);
    lhView.setUint32(14, crc, true);
    lhView.setUint32(18, size, true);
    lhView.setUint32(22, size, true);
    lhView.setUint16(26, nameBytes.length, true);
    lhView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);
    localChunks.push(localHeader, file.data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const chView = new DataView(centralHeader.buffer);
    chView.setUint32(0, 0x02014b50, true);
    chView.setUint16(4, 20, true);
    chView.setUint16(6, 20, true);
    chView.setUint16(8, 0, true);
    chView.setUint16(10, 0, true);
    chView.setUint16(12, 0, true);
    chView.setUint16(14, 0, true);
    chView.setUint32(16, crc, true);
    chView.setUint32(20, size, true);
    chView.setUint32(24, size, true);
    chView.setUint16(28, nameBytes.length, true);
    chView.setUint16(30, 0, true);
    chView.setUint16(32, 0, true);
    chView.setUint16(34, 0, true);
    chView.setUint16(36, 0, true);
    chView.setUint32(38, 0, true);
    chView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralChunks.push(centralHeader);

    offset += localHeader.length + file.data.length;
  }

  const centralSize = centralChunks.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, files.length, true);
  eocdView.setUint16(10, files.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, offset, true);

  const totalSize = offset + centralSize + 22;
  const out = new Uint8Array(totalSize);
  let pos = 0;
  for (const chunk of localChunks) { out.set(chunk, pos); pos += chunk.length; }
  for (const chunk of centralChunks) { out.set(chunk, pos); pos += chunk.length; }
  out.set(eocd, pos);
  return out;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Authorize: require admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Missing auth" }), { status: 401, headers: corsHeaders });

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { data: roleData } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: corsHeaders });

    const admin = createClient(supabaseUrl, serviceKey);
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || (req.method === "POST" ? "import" : "export");

    if (action === "export") {
      const files: { name: string; data: Uint8Array }[] = [];
      const summary: Record<string, number> = {};
      const encoder = new TextEncoder();
      for (const table of TABLES) {
        const { data, error } = await admin.from(table).select("*");
        if (error) {
          console.error(`Export ${table} failed:`, error);
          continue;
        }
        summary[table] = data?.length ?? 0;
        files.push({ name: `${table}.csv`, data: encoder.encode(toCSV(data ?? [])) });
      }
      const meta = `Backup gerado em ${new Date().toISOString()}\n\n` +
        Object.entries(summary).map(([t, n]) => `${t}: ${n} linhas`).join("\n");
      files.push({ name: "_README.txt", data: encoder.encode(meta) });

      const zip = buildZip(files);
      const responseBody = new Uint8Array(zip.byteLength);
      responseBody.set(zip);
      return new Response(responseBody, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="backup-${new Date().toISOString().slice(0, 10)}.zip"`,
        },
      });
    }

    if (action === "import") {
      const body = await req.json();
      const { table, csv, mode } = body as { table: string; csv: string; mode: "insert" | "upsert" };
      if (!TABLES.includes(table)) {
        return new Response(JSON.stringify({ error: "Tabela inválida" }), { status: 400, headers: corsHeaders });
      }
      const rows = parseCSV(csv);
      if (rows.length === 0) {
        return new Response(JSON.stringify({ error: "CSV vazio ou inválido" }), { status: 400, headers: corsHeaders });
      }
      // Coerce strings -> proper types
      const coerced = rows.map((r) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) out[k] = coerceValue(v);
        return out;
      });

      const query = mode === "upsert"
        ? admin.from(table).upsert(coerced, { onConflict: "id" })
        : admin.from(table).insert(coerced);
      const { error, count } = await query;
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
      }
      return new Response(JSON.stringify({ ok: true, table, rows: coerced.length, count }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), { status: 400, headers: corsHeaders });
  } catch (err) {
    console.error("backup-csv error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
