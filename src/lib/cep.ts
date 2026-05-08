/**
 * CEP (Código de Endereçamento Postal) — Brasil
 * Utilitários para limpar, formatar e validar CEPs antes de persistir.
 */

/** Remove qualquer caractere não numérico. */
export const cleanCep = (value: string | null | undefined): string =>
  (value ?? '').replace(/\D/g, '').slice(0, 8);

/** Formata como 00000-000 (aceita parcial enquanto digita). */
export const formatCep = (value: string | null | undefined): string => {
  const digits = cleanCep(value);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
};

/**
 * Valida o CEP:
 * - precisa ter exatamente 8 dígitos
 * - não pode ser sequência repetida (00000000, 11111111, ...)
 * - não pode começar com 0000 (faixa não atribuída pelos Correios)
 */
export const isValidCep = (value: string | null | undefined): boolean => {
  const d = cleanCep(value);
  if (d.length !== 8) return false;
  if (/^(\d)\1{7}$/.test(d)) return false;
  if (d.startsWith('0000')) return false;
  return true;
};

/** Mensagem de erro padrão para feedback ao usuário. */
export const cepErrorMessage = (value: string | null | undefined): string | null => {
  const d = cleanCep(value);
  if (d.length === 0) return 'Informe o CEP';
  if (d.length !== 8) return 'CEP deve conter 8 dígitos';
  if (/^(\d)\1{7}$/.test(d)) return 'CEP inválido';
  if (d.startsWith('0000')) return 'CEP inválido';
  return null;
};
