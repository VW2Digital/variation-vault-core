/**
 * Maps raw payment error messages to user-friendly Portuguese messages.
 * Shared across all checkout flows (main checkout + payment links).
 *
 * Covers Mercado Pago status_detail codes, Asaas error messages,
 * and generic gateway/network errors.
 */
export function mapPaymentErrorMessage(message: string): string {
  const n = message.toLowerCase();

  // ── Mercado Pago status_detail codes ──────────────────────────────

  // Card data errors
  if (n.includes('bad_filled_card_number'))
    return 'Número do cartão incorreto. Confira e tente novamente.';
  if (n.includes('bad_filled_date'))
    return 'Data de validade incorreta. Confira mês e ano do cartão.';
  if (n.includes('bad_filled_security_code'))
    return 'Código de segurança (CVV) incorreto. Confira e tente novamente.';
  if (n.includes('bad_filled_other') || n.includes('bad_filled_card_data'))
    return 'Dados do cartão incorretos. Confira todas as informações e tente novamente.';

  // Issuing bank rejections
  if (n.includes('insufficient_amount') || n.includes('cc_rejected_insufficient_amount'))
    return 'Cartão sem limite ou saldo suficiente para esta compra.';
  if (n.includes('call_for_authorize') || n.includes('required_call_for_authorize'))
    return 'Seu banco precisa autorizar este pagamento. Ligue para a central do cartão e tente novamente.';
  if (n.includes('card_disabled') || n.includes('cc_rejected_card_disabled'))
    return 'Seu cartão está desabilitado. Ative-o junto ao banco ou use outro cartão.';
  if (n.includes('duplicated_payment') || n.includes('cc_rejected_duplicated_payment'))
    return 'Pagamento duplicado detectado. Verifique se já não foi cobrado antes de tentar novamente.';
  if (n.includes('invalid_installments') || n.includes('cc_rejected_invalid_installments'))
    return 'Número de parcelas inválido para este cartão. Escolha outra opção de parcelamento.';
  if (n.includes('max_attempts') || n.includes('cc_rejected_max_attempts'))
    return 'Limite de tentativas atingido. Aguarde alguns minutos ou use outro cartão.';

  // Fraud / security rejections
  if (n.includes('high_risk') || n.includes('cc_rejected_high_risk'))
    return 'Pagamento recusado por motivos de segurança. Tente com outro cartão ou método de pagamento.';
  if (n.includes('blacklist') || n.includes('cc_rejected_blacklist'))
    return 'Este cartão não pode ser utilizado. Use outro cartão ou pague via PIX.';
  if (n.includes('rejected_by_issuer'))
    return 'Pagamento recusado pelo banco emissor. Entre em contato com seu banco ou use outro cartão.';
  if (n.includes('cc_rejected_other_reason'))
    return 'Pagamento recusado pela operadora. Tente com outro cartão ou entre em contato com seu banco.';

  // BIN / tokenization errors
  if (n.includes('diff_param_bins') || n.includes('bin'))
    return 'Erro na validação da bandeira do cartão. Tente novamente ou use outro cartão.';
  if (n.includes('token') || n.includes('tokeniz'))
    return 'Erro ao processar os dados do cartão. Confira os dados e tente novamente.';

  // ── Generic / Asaas / shared errors ───────────────────────────────

  if (n.includes('cpf'))
    return 'CPF inválido. Revise os dados do titular e tente novamente.';

  if (n.includes('credit card') || n.includes('cartão') || n.includes('ccv') || n.includes('cvv'))
    return 'Dados do cartão inválidos. Confira número, validade e CVV.';

  if (n.includes('insufficient') || n.includes('saldo') || n.includes('funds'))
    return 'Cartão sem limite/saldo suficiente para concluir a compra.';

  if (n.includes('não possui permissão') || n.includes('nao possui permissao') || n.includes('forbidden'))
    return 'Pagamento com cartão indisponível nesta conta no momento. Tente PIX ou contate o suporte.';

  if (n.includes('expired') || n.includes('expirad'))
    return 'Cartão expirado. Utilize um cartão com validade vigente.';

  if (n.includes('rejected') || n.includes('recusad'))
    return 'Pagamento recusado pela operadora do cartão. Tente outro cartão ou entre em contato com seu banco.';

  if (n.includes('timeout') || n.includes('timed out') || n.includes('network'))
    return 'Falha de conexão. Verifique sua internet e tente novamente.';

  if (n.includes('rate_limit') || n.includes('too many'))
    return 'Muitas tentativas em pouco tempo. Aguarde um momento e tente novamente.';

  return message;
}

/**
 * Classifies whether an error is a card rejection / fraud / risk error
 * (eligible for multi-gateway fallback) vs. a user input mistake
 * (CVV/date/number wrong) or unrelated error.
 *
 * Returns true ONLY for errors where retrying with a DIFFERENT gateway
 * is likely to succeed — e.g. issuer rejection, fraud rules, blacklist,
 * insufficient funds, "other reason". Returns false for typos in the
 * card form, network/timeout, or non-card errors.
 */
export function isCardRejectionEligibleForFallback(message: string): boolean {
  if (!message) return false;
  const n = message.toLowerCase();

  // Explicit user input errors → fallback won't help, user must fix data
  const userInputErrors = [
    'bad_filled_card_number',
    'bad_filled_date',
    'bad_filled_security_code',
    'bad_filled_other',
    'bad_filled_card_data',
    'invalid_installments',
    'cc_rejected_invalid_installments',
    'cvv',
    'ccv',
    'expired',
    'expirad',
    'cpf inválido',
    'cpf invalido',
    'tokeniz',
  ];
  if (userInputErrors.some((k) => n.includes(k))) return false;

  // Eligible: issuer rejected / fraud / risk / insufficient / generic refusal
  const eligibleKeywords = [
    'rejected', 'recusad', 'reprovad', 'declined',
    'high_risk', 'blacklist', 'fraud',
    'insufficient', 'insufficient_amount', 'sem limite', 'sem saldo', 'saldo',
    'call_for_authorize', 'required_call_for_authorize',
    'card_disabled', 'cc_rejected_card_disabled',
    'duplicated_payment',
    'max_attempts', 'cc_rejected_max_attempts',
    'rejected_by_issuer',
    'cc_rejected_other_reason',
    'cc_rejected_high_risk',
    'cc_rejected_blacklist',
    'cc_rejected_insufficient_amount',
    'pagamento recusado',
    'pagamento não aprovado',
    'pagamento nao aprovado',
    'não autorizado',
    'nao autorizado',
    'not authorized',
  ];
  return eligibleKeywords.some((k) => n.includes(k));
}
