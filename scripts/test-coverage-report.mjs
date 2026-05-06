#!/usr/bin/env node
/**
 * Relatório de cobertura de testes por módulo.
 *
 * Para cada módulo (payments, webhooks, rls, coupons, shipping), faz a varredura
 * dos diretórios relevantes e calcula:
 *   - source_files: arquivos de produção encontrados
 *   - test_files:   arquivos *.test.ts(x) ou *_test.ts encontrados
 *   - coverage_pct: round(test_files / source_files * 100)
 *
 * Salva:
 *   - reports/test-coverage-latest.md   (relatório legível)
 *   - reports/test-coverage-history.json (histórico append-only por execução)
 *
 * Uso: node scripts/test-coverage-report.mjs
 */
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const REPORTS_DIR = join(ROOT, 'reports');

/** @type {Record<string,{label:string,roots:string[],sourceMatch:RegExp,testMatch:RegExp,exclude?:RegExp}>} */
const MODULES = {
  payments: {
    label: 'Payments (gateways, factory, checkout)',
    roots: ['src/services/payments', 'src/pages/settings/payment', 'supabase/functions/payment-checkout', 'supabase/functions/asaas-checkout'],
    sourceMatch: /\.(ts|tsx)$/,
    testMatch: /(\.|_)test\.(ts|tsx)$/,
  },
  webhooks: {
    label: 'Webhooks (Asaas, MP, PagBank, Pagar.me, Melhor Envio, retry)',
    roots: [
      'supabase/functions/asaas-webhook',
      'supabase/functions/mercadopago-webhook',
      'supabase/functions/pagbank-webhook',
      'supabase/functions/pagarme-webhook',
      'supabase/functions/melhor-envio-webhook',
      'supabase/functions/webhook-retry',
      'supabase/functions/webhook-healthcheck',
    ],
    sourceMatch: /\.ts$/,
    testMatch: /(\.|_)test\.ts$/,
  },
  rls: {
    label: 'RLS policies (migrations + policy tests)',
    roots: ['supabase/migrations', 'supabase/tests'],
    sourceMatch: /\.sql$/i,
    testMatch: /(policies|rls).*\.sql$/i,
  },
  coupons: {
    label: 'Coupons (page, RPC, validation)',
    roots: ['src/pages/CouponsPage.tsx', 'src/lib', 'supabase/functions/payment-checkout'],
    sourceMatch: /coupon/i,
    testMatch: /coupon.*(\.|_)test\.(ts|tsx)$/i,
  },
  shipping: {
    label: 'Shipping (Melhor Envio, frete)',
    roots: [
      'supabase/functions/melhor-envio-oauth',
      'supabase/functions/melhor-envio-shipment',
      'supabase/functions/melhor-envio-webhook',
      'src/pages/settings/SettingsShipping.tsx',
      'src/lib',
    ],
    sourceMatch: /\.(ts|tsx)$/,
    testMatch: /(melhor.?envio|shipping|frete).*(\.|_)test\.(ts|tsx)$/i,
  },
};

function walk(dir) {
  if (!existsSync(dir)) return [];
  const st = statSync(dir);
  if (st.isFile()) return [dir];
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    out.push(...walk(join(dir, entry)));
  }
  return out;
}

function analyzeModule(mod) {
  const allFiles = mod.roots.flatMap(walk);
  const matches = allFiles.filter((f) => mod.sourceMatch.test(f));
  const tests = allFiles.filter((f) => mod.testMatch.test(f));
  // sources = matches that are NOT tests
  const sources = matches.filter((f) => !mod.testMatch.test(f));
  const coveragePct = sources.length === 0 ? 0 : Math.round((tests.length / sources.length) * 100);
  return {
    source_files: sources.length,
    test_files: tests.length,
    coverage_pct: coveragePct,
    sources: sources.map((f) => relative(ROOT, f)).sort(),
    tests: tests.map((f) => relative(ROOT, f)).sort(),
  };
}

function main() {
  const timestamp = new Date().toISOString();
  const result = {};
  for (const [key, mod] of Object.entries(MODULES)) {
    result[key] = { label: mod.label, ...analyzeModule(mod) };
  }

  const totalSources = Object.values(result).reduce((a, m) => a + m.source_files, 0);
  const totalTests = Object.values(result).reduce((a, m) => a + m.test_files, 0);
  const totalPct = totalSources === 0 ? 0 : Math.round((totalTests / totalSources) * 100);

  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  // 1. Markdown atual
  const mdLines = [];
  mdLines.push(`# Cobertura de Testes por Módulo`);
  mdLines.push('');
  mdLines.push(`Gerado em: ${timestamp}`);
  mdLines.push('');
  mdLines.push(`**Total**: ${totalTests} testes / ${totalSources} arquivos = **${totalPct}%**`);
  mdLines.push('');
  mdLines.push('| Módulo | Arquivos fonte | Arquivos de teste | Cobertura |');
  mdLines.push('|--------|----------------|-------------------|-----------|');
  for (const [key, m] of Object.entries(result)) {
    mdLines.push(`| \`${key}\` — ${m.label} | ${m.source_files} | ${m.test_files} | ${m.coverage_pct}% |`);
  }
  mdLines.push('');
  mdLines.push('## Detalhe por módulo');
  for (const [key, m] of Object.entries(result)) {
    mdLines.push('');
    mdLines.push(`### ${key} — ${m.label}`);
    mdLines.push(`- Fontes: ${m.source_files}`);
    mdLines.push(`- Testes: ${m.test_files}`);
    if (m.tests.length > 0) {
      mdLines.push('- Arquivos de teste:');
      for (const t of m.tests) mdLines.push(`  - \`${t}\``);
    } else {
      mdLines.push('- _Nenhum teste encontrado para este módulo._');
    }
  }
  writeFileSync(join(REPORTS_DIR, 'test-coverage-latest.md'), mdLines.join('\n') + '\n');

  // 2. Histórico append-only
  const historyPath = join(REPORTS_DIR, 'test-coverage-history.json');
  let history = [];
  if (existsSync(historyPath)) {
    try { history = JSON.parse(readFileSync(historyPath, 'utf8')); } catch { history = []; }
  }
  history.push({
    timestamp,
    total: { source_files: totalSources, test_files: totalTests, coverage_pct: totalPct },
    modules: Object.fromEntries(
      Object.entries(result).map(([k, m]) => [k, {
        source_files: m.source_files,
        test_files: m.test_files,
        coverage_pct: m.coverage_pct,
      }]),
    ),
  });
  writeFileSync(historyPath, JSON.stringify(history, null, 2) + '\n');

  // 3. Print no console
  console.log(`\nCobertura total: ${totalPct}%  (${totalTests} testes / ${totalSources} arquivos)`);
  for (const [key, m] of Object.entries(result)) {
    console.log(`  - ${key.padEnd(10)} ${String(m.coverage_pct).padStart(3)}%  (${m.test_files}/${m.source_files})`);
  }
  console.log(`\nRelatório salvo em ${relative(ROOT, join(REPORTS_DIR, 'test-coverage-latest.md'))}`);
  console.log(`Histórico em      ${relative(ROOT, historyPath)} (${history.length} execuções registradas)`);
}

main();