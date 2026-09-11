import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 pb-20 pt-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-orange/25 bg-orange/10 text-orange">
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
          />
        </svg>
      </div>
      <h1 className="mt-5 font-display text-xl font-semibold text-paper">Funcionário não encontrado</h1>
      <p className="mt-2 text-sm text-muted">
        Não encontramos nenhum registro para esse funcionário. Ele pode ter sido removido da planilha, ou o
        link pode estar desatualizado.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-lg border border-orange/30 bg-orange/10 px-4 py-2 text-sm font-medium text-orange transition hover:bg-orange/20"
      >
        Voltar para a busca
      </Link>
    </div>
  );
}
