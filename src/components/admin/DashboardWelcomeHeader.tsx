interface Props {
  adminName?: string;
}

/**
 * Saudação simples para o topo do Dashboard.
 * Não duplica busca/notificações/CTA — esses já vivem no AdminLayout.
 */
export function DashboardWelcomeHeader({ adminName }: Props) {
  const firstName = (adminName || 'Admin').split(' ')[0];
  return (
    <div>
      <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
        Bem-vindo de volta, {firstName}!
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        Aqui está um resumo da sua loja hoje.
      </p>
    </div>
  );
}