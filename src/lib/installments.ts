/**
 * Tabela de juros padrão por quantidade de parcelas (fallback).
 * Chave = número de parcelas, Valor = percentual de juros sobre o valor base.
 */
export const DEFAULT_INTEREST_TABLE: Record<number, number> = {
  1: 0,
  2: 0.05,
  3: 0.07,
  4: 0.09,
  5: 0.12,
  6: 0.15,
  7: 0.18,
  8: 0.21,
  9: 0.24,
  10: 0.27,
  11: 0.30,
  12: 0.33,
};

export const MAX_ALLOWED_INSTALLMENTS = 12;

export interface InstallmentResult {
  parcelas: number;
  percentualJuros: number;
  valorFinal: number;
  valorParcela: number;
}

/**
 * Calcula o parcelamento com juros embutidos.
 * @param valorBase - Valor original do pedido (produtos + frete)
 * @param parcelas - Quantidade de parcelas escolhida
 * @param interestTable - Tabela de juros customizada (opcional, usa padrão se não fornecida)
 */
export function calcularParcelamento(
  valorBase: number,
  parcelas: number,
  interestTable: Record<number, number> = DEFAULT_INTEREST_TABLE,
): InstallmentResult {
  if (parcelas < 1 || parcelas > MAX_ALLOWED_INSTALLMENTS || !Number.isInteger(parcelas)) {
    throw new Error(`Quantidade de parcelas inválida: ${parcelas}. Permitido: 1 a ${MAX_ALLOWED_INSTALLMENTS}.`);
  }

  const percentualJuros = interestTable[parcelas] ?? DEFAULT_INTEREST_TABLE[parcelas] ?? 0;
  const valorFinal = Number((valorBase * (1 + percentualJuros)).toFixed(2));
  const valorParcela = Number((valorFinal / parcelas).toFixed(2));

  return { parcelas, percentualJuros, valorFinal, valorParcela };
}

/**
 * Gera todas as opções de parcelamento para exibição no frontend.
 * @param valorBase - Valor total do pedido
 * @param maxParcelas - Limite máximo de parcelas (configurável via admin)
 * @param interestTable - Tabela de juros customizada (opcional)
 */
export function gerarOpcoesParcelamento(
  valorBase: number,
  maxParcelas: number,
  interestTable?: Record<number, number>,
): InstallmentResult[] {
  const limit = Math.min(maxParcelas, MAX_ALLOWED_INSTALLMENTS);
  const maxByValue = Math.max(1, Math.floor(valorBase / 5) || 1);
  const effectiveMax = Math.min(limit, maxByValue);

  const opcoes: InstallmentResult[] = [];
  for (let i = 1; i <= effectiveMax; i++) {
    opcoes.push(calcularParcelamento(valorBase, i, interestTable));
  }
  return opcoes;
}

/**
 * Serializa a tabela de juros para armazenamento no site_settings.
 */
export function serializeInterestTable(table: Record<number, number>): string {
  return JSON.stringify(table);
}

/**
 * Desserializa a tabela de juros do site_settings.
 * Retorna a tabela padrão se o valor for inválido.
 */
export function parseInterestTable(value: string | null | undefined): Record<number, number> {
  if (!value) return { ...DEFAULT_INTEREST_TABLE };
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_INTEREST_TABLE };
    // Normalize: ensure keys are numbers and values are valid percentages
    const table: Record<number, number> = {};
    for (let i = 1; i <= MAX_ALLOWED_INSTALLMENTS; i++) {
      const val = Number(parsed[String(i)] ?? parsed[i]);
      table[i] = Number.isFinite(val) && val >= 0 ? val : (DEFAULT_INTEREST_TABLE[i] ?? 0);
    }
    return table;
  } catch {
    return { ...DEFAULT_INTEREST_TABLE };
  }
}
