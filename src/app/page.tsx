import SearchPanel from "@/components/SearchPanel";
import { getDocumentos, getFuncionarios, getPagamentos } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [funcionarios, pagamentos, documentos] = await Promise.all([
    getFuncionarios(),
    getPagamentos(),
    getDocumentos(),
  ]);

  const ativos = funcionarios.filter((f) => f.status === "ATIVO").length;
  const alertas = pagamentos.filter((p) => p.situacao === "Cancelado" || p.situacao === "Rejeitado").length;

  return (
    <div className="flex flex-col items-center px-4 pb-16 pt-14 sm:pt-20">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-orange/25 bg-orange/5 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-orange/90">
        <span className="h-1.5 w-1.5 rounded-full bg-orange" />
        Consulta interna de pagamentos
      </div>
      <h1 className="max-w-xl text-balance text-center font-display text-3xl font-semibold leading-tight text-paper sm:text-4xl">
        Encontre o comprovante em segundos
      </h1>
      <p className="mt-3 max-w-md text-balance text-center text-sm text-muted sm:text-base">
        Busque por nome ou CPF e veja salário, vale-transporte e auxílio — com o comprovante em PDF
        pronto para mostrar.
      </p>

      <div className="mt-8 w-full">
        <SearchPanel />
      </div>

      <div className="mt-12 grid w-full max-w-2xl grid-cols-2 gap-3 px-4 sm:grid-cols-4 sm:px-6">
        <StatPill label="Funcionários" value={funcionarios.length} />
        <StatPill label="Ativos" value={ativos} />
        <StatPill label="Comprovantes" value={documentos.length} />
        <StatPill
          label="Alertas"
          value={alertas}
          tone={alertas > 0 ? "danger" : "default"}
        />
      </div>

      <a
        href="/api/exportar"
        className="mt-6 inline-flex items-center gap-2 rounded-lg border border-onyx-border bg-onyx-soft/60 px-4 py-2 text-sm text-muted transition hover:border-orange/40 hover:text-paper"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 8.25L12 3.75m0 0L7.5 8.25M12 3.75v12.75"
          />
        </svg>
        Exportar planilha geral (Excel)
      </a>
    </div>
  );
}

function StatPill({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "danger";
}) {
  return (
    <div className="rounded-xl border border-onyx-border bg-onyx-soft/60 px-3 py-3 text-center sm:px-4">
      <p
        className={
          "font-display text-xl font-semibold sm:text-2xl " +
          (tone === "danger" && value > 0 ? "text-rose-400" : "text-paper")
        }
      >
        {value.toLocaleString("pt-BR")}
      </p>
      <p className="mt-0.5 text-[11px] text-muted">{label}</p>
    </div>
  );
}
