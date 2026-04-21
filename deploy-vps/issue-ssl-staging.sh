#!/usr/bin/env bash
# =============================================================================
# Liberty Pharma - Emissão de SSL em modo STAGING (TESTE)
# =============================================================================
# Wrapper para issue-ssl.sh que força o modo --staging do Let's Encrypt.
#
# ⚠️  USE APENAS PARA TESTAR a configuração (Nginx, DNS, portas, volumes).
#     O certificado emitido NÃO é confiável pelo navegador (mostrará aviso),
#     mas NÃO consome o rate limit do Let's Encrypt (5 certs/semana).
#
# Quando usar:
#   • Você bateu o rate limit e precisa validar a config sem esperar
#   • Está fazendo um deploy novo e quer garantir que tudo funciona
#   • Quer testar renovação automática sem risco
#
# Quando NÃO usar:
#   • Em produção real (use issue-ssl.sh sem --staging)
#
# Uso:
#   sudo bash /opt/liberty-pharma/deploy-vps/issue-ssl-staging.sh <dominio> <email>
#
# Exemplo:
#   sudo bash /opt/liberty-pharma/deploy-vps/issue-ssl-staging.sh luminaeliberty.com admin@luminaeliberty.com
#
# Quando estiver tudo OK, rode em produção:
#   sudo bash /opt/liberty-pharma/deploy-vps/issue-ssl.sh luminaeliberty.com admin@luminaeliberty.com
# =============================================================================

set -euo pipefail

YELLOW='\033[1;33m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'

DOMAIN="${1:-}"
EMAIL="${2:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo -e "${YELLOW}Uso:${NC} sudo bash $0 <dominio> <email>"
  echo -e "${YELLOW}Ex: ${NC} sudo bash $0 luminaeliberty.com admin@luminaeliberty.com"
  exit 1
fi

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         MODO STAGING - Let's Encrypt (TESTE)              ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo -e "${YELLOW}⚠️  Certificado de teste — navegador exibirá aviso de segurança${NC}"
echo -e "${YELLOW}⚠️  NÃO conta no rate limit (5 certs/semana) do Let's Encrypt${NC}"
echo -e "${GREEN}✓  Use para validar config sem queimar quotas${NC}"
echo ""

# Delega para o issue-ssl.sh com a flag --staging
exec bash "$SCRIPT_DIR/issue-ssl.sh" "$DOMAIN" "$EMAIL" --staging
