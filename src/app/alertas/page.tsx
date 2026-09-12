import Link from "next/link";
import { getFuncionarios, getPagamentos } from "@/lib/data";
import { findEmployeeById } from "@/lib/employeeId";
import { SituacaoBadge, TipoBadge } from "@/components/Badge";
import { formatBRL, isoDateToBr } from "@/lib/normalize";

export const dynamic = "force-dynamic";

export default async function AlertasPage() {
  const [funcionarios, pagamentos] = await Promise.all([getFuncionarios(), getPagamentos()]);

  const alertas = pagamentos.filter((p) => p.situacao === "Cancelado" || p.situacao === "Rejeitado");

  const porFuncionario = new Map<string, typeof alertas>();
  for (const a of alertas) {
    const chave = a.funcionarioResolvidoId || `sem-vinculo:${a.nomeNorm}`;
    const arr = porFuncionario.get(chave) || [];
    arr.push(a);
    porFuncionario.set(chave, arr);
  }

  const grupos = Array.from(porFuncionario.entries())
    .map(([chave, itens]) => {
      const funcionario = chave.startsWith("sem-vinculo:") ? null : findEmployeeById(funcionarios, chave);
      const maisRecente = itens.slice().sort((a, b) => (b.data || "").localeCompare(a.data || ""))[0];
      return { chave, funcionario, itens, maisRecente };
    })
    .sort((a, b) => (b.maisRecente.data || "").localeCompare(a.maisRecente.data || ""));

  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300">
          <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M12 9v3.75m0 3.75h.008v.008H12v-.008zM21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </span>
        <div>
          <h1 className="font-display text-xl font-semibold text-paper sm:text-2xl">Painel de alertas</h1>
          <p className="text-sm text-muted">
            Pagamentos marcados como <strong className="text-rose-300">cancelados</strong> ou{" "}
            <strong className="text-rose-300">rejeitados</strong> nos relatórios do banco — funcionários que
            provavelmente não receberam de fato.
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {grupos.length === 0 && (
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-5 py-8 text-center text-sm text-emerald-300">
            Nenhum alerta no momento — todos os pagamentos registrados aparecem como pagos.
          </div>
        )}

        {grupos.map(({ chave, funcionario, itens }) => (
          <div key={chave} className="animate-fade-up rounded-xl border border-rose-500/25 bg-onyx-soft/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {funcionario ? (
                <Link
                  href={`/funcionario/${encodeURIComponent(chave)}`}
                  className="font-medium text-paper transition hover:text-orange"
                >
                  {funcionario.nome}
                </Link>
              ) : (
                <span className="font-medium text-paper">{itens[0].nome}</span>
              )}
              <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-xs font-medium text-rose-300">
                {itens.length} alerta{itens.length > 1 ? "s" : ""}
              </span>
            </div>
            {funcionario?.cpfFormatado && (
              <p className="mt-0.5 font-mono text-xs text-muted">{funcionario.cpfFormatado}</p>
            )}
            {!funcionario && <p className="mt-0.5 text-xs text-amber-300">Não vinculado a um funcionário da planilha atual</p>}

            <ul className="mt-3 space-y-1.5">
              {itens.map((p, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-onyx/40 px-3 py-1.5 text-xs">
                  <TipoBadge tipo={p.tipo} />
                  <SituacaoBadge situacao={p.situacao} />
                  <span className="text-muted">{isoDateToBr(p.data)}</span>
                  {p.valor !== null && <span className="text-paper">{formatBRL(p.valor)}</span>}
                  {p.motivo && <span className="text-muted">· {p.motivo}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
