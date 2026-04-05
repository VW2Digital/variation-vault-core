/**
 * Maps raw payment error messages to user-friendly Portuguese messages.
 * Shared across all checkout flows (main checkout + payment links).
 */
export function mapPaymentErrorMessage(message: string): string {
  const n = message.toLowerCase();

  if (n.includes('cpf')) return 'CPF inválido. Revise os dados do titular e tente novamente.';

  if (n.includes('credit card') || n.includes('cartão') || n.includes('ccv') || n.includes('cvv'))
    return 'Dados do cartão inválidos. Confira número, validade e CVV.';

  if (n.includes('insufficient') || n.includes('saldo') || n.includes('funds'))
    return 'Cartão sem limite/saldo suficiente para concluir a compra.';

  if (n.includes('não possui permissão') || n.includes('nao possui permissao') || n.includes('forbidden'))
    return 'Pagamento com cartão indisponível nesta conta no momento. Tente PIX ou contate o suporte.';

  if (n.includes('diff_param_bins') || n.includes('bin'))
    return 'Erro na validação da bandeira do cartão. Tente novamente ou use outro cartão.';

  if (n.includes('expired') || n.includes('expirad'))
    return 'Cartão expirado. Utilize um cartão com validade vigente.';

  if (n.includes('rejected') || n.includes('recusad'))
    return 'Pagamento recusado pela operadora do cartão. Tente outro cartão ou entre em contato com seu banco.';

  if (n.includes('timeout') || n.includes('timed out') || n.includes('network'))
    return 'Falha de conexão. Verifique sua internet e tente novamente.';

  if (n.includes('token') || n.includes('tokeniz'))
    return 'Erro ao processar os dados do cartão. Confira os dados e tente novamente.';

  return message;
}
