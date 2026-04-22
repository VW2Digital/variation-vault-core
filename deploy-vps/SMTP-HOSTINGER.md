# SMTP Hostinger — Guia de produção

Este guia configura SMTP da Hostinger para **Supabase Auth** (signup, reset, magic link, invite, change email, OTP) **e** para a Edge Function `send-email` (transacionais).

---

## 1. Criar conta de e-mail no hPanel

1. hPanel → **Emails** → **Email Accounts** → criar `no-reply@seu-dominio.com`
2. Anote a **senha real** (NÃO use a senha do painel Hostinger).

---

## 2. Credenciais SMTP

| Campo  | Valor                                  |
|--------|----------------------------------------|
| Host   | `smtp.hostinger.com`                   |
| Porta  | **465** (SSL) ou **587** (STARTTLS)    |
| User   | `no-reply@seu-dominio.com` (completo)  |
| Pass   | senha real da conta de e-mail          |
| From   | `no-reply@seu-dominio.com`             |

---

## 3. Supabase Auth → Custom SMTP

Dashboard Supabase → **Authentication → Emails → SMTP Settings** → **Enable Custom SMTP**

Cole as credenciais acima. Defina:
- **Sender email**: `no-reply@seu-dominio.com`
- **Sender name**: nome amigável (ex.: `Liberty Pharma`)
- **Minimum interval between emails**: `60` (anti-abuso)

Sem isso, Supabase Auth fica limitado a **4 e-mails/hora** (default).

---

## 4. Edge Function `send-email`

Os secrets (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`, `SMTP_SECURE`) são gravados pelo `install.sh`. Também ficam em `site_settings` (UI: `/admin/configuracoes/comunicacao`) com prioridade sobre os secrets — permite trocar credenciais sem redeploy.

A função tenta **SMTP primeiro** e cai em **Resend HTTP API** se SMTP falhar (timeout, credencial revogada, etc.).

---

## 5. DNS — SPF, DKIM, DMARC (OBRIGATÓRIO)

Sem esses 3 registros, e-mails caem em SPAM ou são rejeitados.

### SPF (TXT na raiz)
```
Tipo:  TXT
Nome:  @
Valor: v=spf1 include:_spf.hostinger.com -all
```

### DKIM
hPanel → **Emails → DKIM** → ative para o domínio. A Hostinger gera os 2 registros TXT (`hostingermail1._domainkey` e `hostingermail2._domainkey`) — adicione no DNS.

### DMARC (TXT)
```
Tipo:  TXT
Nome:  _dmarc
Valor: v=DMARC1; p=quarantine; rua=mailto:dmarc@seu-dominio.com; pct=100; adkim=s; aspf=s
```

> Comece com `p=quarantine`. Após 30 dias monitorando relatórios, suba para `p=reject`.

### Verificar
```bash
dig TXT seu-dominio.com +short                     # SPF
dig TXT hostingermail1._domainkey.seu-dominio.com  # DKIM
dig TXT _dmarc.seu-dominio.com +short              # DMARC
```

Ou use https://mxtoolbox.com/SuperTool.aspx (SPF / DKIM / DMARC checks).

---

## 6. Troubleshooting

| Sintoma | Causa provável | Fix |
|---|---|---|
| E-mail não chega (signup/reset) | Custom SMTP não habilitado no Supabase Auth | Passo 3 |
| `535 Authentication failed` | Senha errada ou conta SMTP inativa | Recriar senha no hPanel |
| Timeout na porta 465 | Firewall do provedor (VPS Oracle/AWS) bloqueia 465 | Use 587 + `SMTP_SECURE=tls` |
| E-mail vai para SPAM | SPF/DKIM/DMARC ausentes ou inválidos | Passo 5 + aguardar 24h DNS |
| `send-email` retorna 502 | SMTP falhou + Resend não configurado | Configurar `RESEND_API_KEY` como fallback |
| Edge Function loga `domain is not verified` | Resend fallback usando domínio não verificado | Verificar domínio em resend.com/domains |
| `From` aparece como `onboarding@resend.dev` | Domínio público (gmail/hotmail) ou não configurado | Definir `smtp_from_email` com domínio próprio |

### Logs sem secrets
A Edge Function **mascara** a senha em qualquer mensagem de erro (substitui por `***`). Nunca logue `SMTP_PASS` em scripts customizados.

---

## 7. Arquitetura final

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (Vercel/Netlify/Cloudflare/VPS — sem Lovable)     │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        ▼                             ▼
  Supabase Auth                Edge Function send-email
  (SMTP customizado)           ├─ 1) SMTP Hostinger  (primário)
  signup/reset/magic           └─ 2) Resend HTTP API (fallback)
                                    │
                                    ▼
                              email_send_log
                              (auditoria — /admin/logs-email)
```

**Separação de responsabilidades:**
- **Supabase Auth** → fluxos nativos de autenticação (templates editáveis no Dashboard).
- **Edge Function `send-email`** → e-mails de negócio (pedido, frete, alertas, eventos webhook).
- **Edge Function `email-events`** → roteador semântico que recebe eventos e chama `send-email`.
