const ERROR_MAP: Record<string, { titulo: string; detalhe: string }> = {
  missing_code:     { titulo: "Link inválido ou expirado",     detalhe: "O link de acesso não é mais válido. Solicite um novo para continuar." },
  exchange_failed:  { titulo: "Falha na validação do link",    detalhe: "Não foi possível completar a autenticação. Tente novamente com um link fresco." },
  no_email:         { titulo: "E-mail não identificado",       detalhe: "Não conseguimos ler o e-mail associado a esse acesso. Contate o administrador." },
  not_authorized:   { titulo: "Acesso não autorizado",         detalhe: "Este e-mail não está na lista de acesso. Solicite autorização ao administrador." },
  pending_approval: { titulo: "Solicitação de acesso enviada", detalhe: "Seu pedido de acesso foi registrado e está aguardando aprovação do administrador. Você receberá um email assim que for liberado." },
  inactive:         { titulo: "Conta bloqueada",                detalhe: "Sua conta foi desativada. Contate o administrador para reativar." },
  session_expired:  { titulo: "Sessão expirada",                detalhe: "Sua sessão expirou por inatividade. Faça login novamente para continuar." },
};

const DEFAULT = {
  titulo: "Não foi possível fazer login",
  detalhe: "Algo deu errado durante a autenticação. Se o problema persistir, solicite um novo link.",
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const { titulo, detalhe } = (reason ? ERROR_MAP[reason] : undefined) ?? DEFAULT;

  return (
    <div className="grid-lines min-h-screen">
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="panel rounded-3xl p-8">
            <p className="kicker text-xs text-muted">Autenticação</p>
            <h1 className="mt-3 text-xl font-semibold leading-snug">{titulo}</h1>
            <p className="mt-3 text-sm leading-7 text-muted">{detalhe}</p>
            <a
              href="/login"
              className="mt-6 block rounded-xl bg-accent px-6 py-3 text-center text-sm font-semibold text-white transition hover:opacity-90"
            >
              Solicitar novo link
            </a>
            <p className="mt-4 text-center text-xs text-muted">
              Problemas recorrentes? Fale com o administrador do sistema.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
