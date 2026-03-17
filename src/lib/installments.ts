/**
 * Tabela de juros por quantidade de parcelas.
 * Chave = número de parcelas, Valor = percentual de juros sobre o valor base.
 * Ex: 4 parcelas = 9% de juros → valor final = base * 1.09
 */
export const INTEREST_TABLE: Record<number, number> = {
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
 * @returns Objeto com valor final, valor da parcela e percentual de juros
 */
export function calcularParcelamento(valorBase: number, parcelas: number): InstallmentResult {
  if (parcelas < 1 || parcelas > MAX_ALLOWED_INSTALLMENTS || !Number.isInteger(parcelas)) {
    throw new Error(`Quantidade de parcelas inválida: ${parcelas}. Permitido: 1 a ${MAX_ALLOWED_INSTALLMENTS}.`);
  }

  const percentualJuros = INTEREST_TABLE[parcelas] ?? 0;
  const valorFinal = Number((valorBase * (1 + percentualJuros)).toFixed(2));
  const valorParcela = Number((valorFinal / parcelas).toFixed(2));

  return {
    parcelas,
    percentualJuros,
    valorFinal,
    valorParcela,
  };
}

/**
 * Gera todas as opções de parcelamento para exibição no frontend.
 * @param valorBase - Valor total do pedido
 * @param maxParcelas - Limite máximo de parcelas (configurável via admin)
 * @returns Array de opções de parcelamento
 */
export function gerarOpcoesParcelamento(valorBase: number, maxParcelas: number): InstallmentResult[] {
  const limit = Math.min(maxParcelas, MAX_ALLOWED_INSTALLMENTS);
  // Parcela mínima de R$ 5,00
  const maxByValue = Math.max(1, Math.floor(valorBase / 5) || 1);
  const effectiveMax = Math.min(limit, maxByValue);

  const opcoes: InstallmentResult[] = [];
  for (let i = 1; i <= effectiveMax; i++) {
    opcoes.push(calcularParcelamento(valorBase, i));
  }
  return opcoes;
}
