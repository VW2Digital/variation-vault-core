/**
 * Maps raw payment error messages to user-friendly Portuguese messages.
 * Shared across all checkout flows (main checkout + payment links).
 *
 * Covers Mercado Pago status_detail codes, Asaas error messages,
 * and generic gateway/network errors.
 */
export function mapPaymentErrorMessage(message: string): string {
  const n = message.toLowerCase();

  // ── Mercado Pago SDK validation messages (English from SDK) ────────
  // Esses textos vêm do SDK do Mercado Pago no navegador durante a
  // validação dos campos do cartão. Traduzimos com explicações claras
  // para compradores leigos.

  if (n.includes('number field is not a valid card number') || n.includes('invalid card number') || n.includes('cardnumber'))
    return 'O número do cartão informado não é válido. Confira se digitou todos os 16 dígitos corretamente, sem espaços ou letras, exatamente como aparecem na frente do cartão.';

  if (n.includes('security_code') || n.includes('securitycode') || n.includes('cvv field') || n.includes('security code field'))
    return 'O código de segurança (CVV) está incorreto. Esse é o número de 3 dígitos que fica no verso do seu cartão, ao lado da assinatura. Em alguns cartões American Express são 4 dígitos na frente.';

  if (n.includes('expirationmonth') || n.includes('expiration_month') || n.includes('month field'))
    return 'O mês de validade do cartão está incorreto. Use 2 dígitos, de 01 (janeiro) até 12 (dezembro), conforme aparece no seu cartão.';

  if (n.includes('expirationyear') || n.includes('expiration_year') || n.includes('year field'))
    return 'O ano de validade do cartão está incorreto. Digite o ano completo (ex.: 2028) ou os 2 últimos dígitos (ex.: 28), conforme estiver no cartão.';

  if (n.includes('cardholdername') || n.includes('cardholder_name') || n.includes('cardholder name'))
    return 'O nome do titular do cartão está incorreto. Digite exatamente como está impresso na frente do cartão, sem abreviações e sem acentos.';

  if (n.includes('identificationnumber') || n.includes('identification_number') || n.includes('identification number'))
    return 'O CPF do titular do cartão está incorreto. Confira se digitou os 11 números do CPF da pessoa que aparece no cartão.';

  if (n.includes('identificationtype') || n.includes('identification_type'))
    return 'O tipo de documento do titular do cartão é inválido. Selecione CPF e digite somente os números.';

  // ── Mercado Pago status_detail codes ──────────────────────────────

  // Card data errors
  if (n.includes('bad_filled_card_number'))
    return 'Número do cartão incorreto. Confira os 16 dígitos do cartão (na frente) e digite novamente sem espaços.';
  if (n.includes('bad_filled_date'))
    return 'Data de validade incorreta. O mês deve ter 2 dígitos (01 a 12) e o ano também (ex.: 28 para 2028), exatamente como está no cartão.';
  if (n.includes('bad_filled_security_code'))
    return 'Código de segurança (CVV) incorreto. São os 3 números no verso do cartão (ou 4 na frente, no caso do American Express).';
  if (n.includes('bad_filled_other') || n.includes('bad_filled_card_data'))
    return 'Dados do cartão incorretos. Revise nome do titular, número, validade e CVV — todos precisam estar exatamente como no cartão físico.';

  // Issuing bank rejections
  if (n.includes('insufficient_amount') || n.includes('cc_rejected_insufficient_amount'))
    return 'Seu cartão não tem limite ou saldo disponível para esta compra. Tente um valor menor, outro cartão, ou pague via PIX (instantâneo e sem limite).';
  if (n.includes('call_for_authorize') || n.includes('required_call_for_authorize'))
    return 'O seu banco precisa liberar esta compra antes de aprová-la. Ligue para o número que está no verso do seu cartão, autorize a transação com o atendente e tente pagar de novo.';
  if (n.includes('card_disabled') || n.includes('cc_rejected_card_disabled'))
    return 'Este cartão está bloqueado ou desativado pelo banco. Entre em contato com o seu banco para reativá-lo, ou utilize outro cartão / PIX para concluir a compra.';
  if (n.includes('duplicated_payment') || n.includes('cc_rejected_duplicated_payment'))
    return 'Identificamos uma cobrança igual a esta feita há pouco. Antes de tentar novamente, confira no app ou fatura do seu banco se a compra já não foi aprovada para evitar pagar em duplicidade.';
  if (n.includes('invalid_installments') || n.includes('cc_rejected_invalid_installments'))
    return 'A quantidade de parcelas escolhida não é aceita por este cartão. Selecione outra opção de parcelamento (por exemplo, à vista ou em menos vezes) e tente novamente.';
  if (n.includes('max_attempts') || n.includes('cc_rejected_max_attempts'))
    return 'Você atingiu o limite de tentativas com este cartão. Aguarde alguns minutos antes de tentar novamente, ou use outro cartão / PIX para finalizar agora.';

  // Fraud / security rejections
  if (n.includes('high_risk') || n.includes('cc_rejected_high_risk'))
    return 'Por questões de segurança e prevenção a fraudes, o pagamento foi recusado. Isso não significa que há algo errado com o seu cartão. Tente outro cartão, ou pague via PIX para concluir a compra na hora.';
  if (n.includes('blacklist') || n.includes('cc_rejected_blacklist'))
    return 'Este cartão não pode ser usado para esta compra. Tente outro cartão de sua titularidade ou finalize o pedido pagando via PIX, que é instantâneo e seguro.';
  if (n.includes('rejected_by_issuer'))
    return 'O banco que emitiu o seu cartão recusou esta compra. Ligue para o telefone no verso do cartão para entender o motivo e liberar a transação, ou use outro cartão / PIX.';
  if (n.includes('cc_rejected_other_reason'))
    return 'A operadora do seu cartão recusou o pagamento, mas não informou o motivo. Confirme com o seu banco se está tudo certo com o cartão, ou tente outro cartão / PIX.';

  // BIN / tokenization errors
  if (n.includes('diff_param_bins') || n.includes('bin'))
    return 'Não conseguimos identificar a bandeira do seu cartão (Visa, Master, Elo etc.). Confira se o número do cartão foi digitado corretamente. Se persistir, use outro cartão ou pague via PIX.';
  if (n.includes('token') || n.includes('tokeniz'))
    return 'Não foi possível processar os dados do seu cartão com segurança. Revise o número, validade, CVV e nome do titular — todos devem estar exatamente como no cartão físico — e tente novamente.';

  // ── Generic / Asaas / shared errors ───────────────────────────────

  if (n.includes('cpf'))
    return 'CPF inválido. Digite os 11 números do CPF do titular do cartão, sem pontos ou traços, exatamente como está cadastrado na Receita Federal.';

  if (n.includes('credit card') || n.includes('cartão') || n.includes('ccv') || n.includes('cvv'))
    return 'Os dados do cartão estão inválidos. Verifique o número (16 dígitos), a validade (mês/ano) e o CVV (3 dígitos no verso) e tente novamente.';

  if (n.includes('insufficient') || n.includes('saldo') || n.includes('funds'))
    return 'Seu cartão não tem limite ou saldo suficiente para esta compra. Tente outro cartão ou pague via PIX, que não usa o limite do cartão de crédito.';

  if (n.includes('não possui permissão') || n.includes('nao possui permissao') || n.includes('forbidden'))
    return 'Pagamento com cartão de crédito está temporariamente indisponível. Para finalizar agora mesmo, utilize PIX (aprovação instantânea). Se preferir cartão, entre em contato com o nosso suporte.';

  if (n.includes('expired') || n.includes('expirad'))
    return 'Seu cartão está vencido. Verifique a data de validade impressa na frente do cartão (mês/ano) e utilize um cartão dentro do prazo de validade.';

  if (n.includes('rejected') || n.includes('recusad'))
    return 'O pagamento foi recusado pela operadora do cartão. Isso pode acontecer por limite, segurança ou bloqueio do banco. Tente outro cartão, ligue para o seu banco para liberar, ou pague via PIX para garantir a compra agora.';

  if (n.includes('timeout') || n.includes('timed out') || n.includes('network'))
    return 'Não conseguimos concluir a operação por problema de conexão com a internet. Verifique se você está conectado(a) e tente novamente em alguns segundos.';

  if (n.includes('rate_limit') || n.includes('too many'))
    return 'Detectamos muitas tentativas de pagamento em pouco tempo. Por segurança, aguarde 1 ou 2 minutos antes de tentar novamente.';

  // ── Fallback genérico em inglês (último recurso) ──────────────────
  // Se o texto ainda parece ser em inglês (vindo direto de um SDK),
  // devolvemos uma mensagem amigável em português ao invés do texto cru.
  if (/^[\x00-\x7f]+$/.test(message) && /\b(field|invalid|error|failed|not a valid|required)\b/i.test(message)) {
    return 'Não foi possível concluir o pagamento. Revise os dados do cartão (número, validade, CVV e nome do titular) e tente novamente. Se preferir, finalize a compra via PIX.';
  }

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
