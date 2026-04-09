export default function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const messages: Record<string, string> = {
    missing_code: "Link de acesso inválido ou expirado.",
    exchange_failed: "Não foi possível validar o link. Solicite um novo.",
    no_email: "Não foi possível identificar o e-mail da conta.",
    not_authorized: "Este e-mail não está na lista de acesso autorizado.",
  };

  return (
    <div className="grid-lines min-h-screen">
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="panel rounded-3xl p-8 text-center">
            <div className="mb-4 text-3xl">🔒</div>
            <h1 className="mb-2 text-lg font-semibold">Acesso negado</h1>
            <p className="text-sm leading-7 text-muted">
              {/* Será resolvido via client component se necessário */}
              Não foi possível concluir o login. Verifique se seu e-mail está
              autorizado ou solicite um novo link.
            </p>
            <a
              href="/login"
              className="mt-6 inline-block rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Tentar novamente
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
