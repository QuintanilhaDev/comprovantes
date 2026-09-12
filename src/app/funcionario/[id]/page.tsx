import Link from "next/link";
import { notFound } from "next/navigation";
import { getExtratoFuncionario, getFuncionarios } from "@/lib/data";
import { findEmployeeById } from "@/lib/employeeId";
import { SituacaoBadge, TipoBadge } from "@/components/Badge";
import ClassificarDocumento from "@/components/ClassificarDocumento";
import { formatBRL, isoDateToBr } from "@/lib/normalize";
import type { DocumentoResolvido, PagamentoResolvido } from "@/lib/data";
import type { TipoBeneficio } from "@/lib/types";

export const dynamic = "force-dynamic";

const ORDEM_TIPOS: TipoBeneficio[] = ["SALARIO", "VT", "AUXILIO", "NAO_IDENTIFICADO"];
const TITULOS: Record<TipoBeneficio, string> = {
  SALARIO: "Salário",
  VT: "Vale Transporte",
  AUXILIO: "Auxílio (Vale Alimentação)",
  NAO_IDENTIFICADO: "Comprovantes não classificados",
};

export default async function FuncionarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);

  const funcionarios = await getFuncionarios();
  const funcionario = findEmployeeById(funcionarios, decodedId);

  const { pagamentos: pagamentosDoFuncionario, documentos: documentosDoFuncionario } = await getExtratoFuncionario(
    funcionario,
    decodedId
  );

  if (!funcionario && pagamentosDoFuncionario.length === 0 && documentosDoFuncionario.length === 0) {
    notFound();
  }

  const alertas = pagamentosDoFuncionario.filter(
    (p) => p.situacao === "Cancelado" || p.situacao === "Rejeitado"
  );

  const docsPorTipo = new Map<TipoBeneficio, DocumentoResolvido[]>();
  for (const tipo of ORDEM_TIPOS) docsPorTipo.set(tipo, []);
  for (const d of documentosDoFuncionario) {
    docsPorTipo.get(d.tipo)?.push(d);
  }

  const nomeExibido =
    funcionario?.nome || documentosDoFuncionario[0]?.nome || pagamentosDoFuncionario[0]?.nome || "Funcionário";

  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-orange">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Voltar para a busca
      </Link>

      {/* Cabeçalho do funcionário */}
      <div className="mt-4 animate-fade-up rounded-2xl border border-onyx-border bg-onyx-soft/70 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-semibold text-paper sm:text-2xl">{nomeExibido}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              {funcionario?.cpfFormatado && <span className="font-mono">{funcionario.cpfFormatado}</span>}
              {funcionario?.funcao && <span>{funcionario.funcao}</span>}
              {funcionario?.municipioPolo && <span>{funcionario.municipioPolo}</span>}
            </div>
          </div>
          {funcionario?.status && (
            <span
              className={
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium " +
                (funcionario.status === "ATIVO"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-white/10 bg-white/5 text-muted")
              }
            >
              {funcionario.status}
            </span>
          )}
        </div>

        {funcionario && (
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-onyx-border pt-4 text-sm sm:grid-cols-3">
            <Field label="Vínculo" value={funcionario.vinculo} />
            <Field label="Admissão" value={funcionario.admissao ? isoDateToBr(funcionario.admissao) : null} />
            <Field
              label="Optante VT"
              value={funcionario.optanteVT === null || funcionario.optanteVT === undefined ? "Não informado" : funcionario.optanteVT ? "Sim" : "Não"}
            />
            <Field
              label="Banco"
              value={funcionario.banco ? `${funcionario.banco} · ag. ${funcionario.agencia || "—"}` : null}
            />
            <Field label="Telefone" value={funcionario.telefone} />
            <Field label="Zona/Município" value={funcionario.municipioZona} />
          </dl>
        )}

        {!funcionario && (
          <p className="mt-4 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2 text-xs text-amber-200">
            Este nome/CPF não está na planilha de funcionários atual — os registros abaixo vieram de
            comprovantes ou relatórios enviados diretamente.
          </p>
        )}
      </div>

      {/* Alertas de pagamento cancelado/rejeitado */}
      {alertas.length > 0 && (
        <div className="mt-5 animate-fade-up rounded-xl border border-rose-500/30 bg-rose-500/[0.06] p-4 sm:p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-rose-300">
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v3.75m0 3.75h.008v.008H12v-.008zM21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {alertas.length} pagamento{alertas.length > 1 ? "s" : ""} com problema encontrado
            {alertas.length > 1 ? "s" : ""} no relatório do banco
          </div>
          <ul className="mt-3 space-y-2">
            {alertas.map((p, i) => (
              <li key={i} className="rounded-lg border border-rose-500/20 bg-onyx/40 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <TipoBadge tipo={p.tipo} />
                  <SituacaoBadge situacao={p.situacao} />
                  <span className="text-muted">{isoDateToBr(p.data)}</span>
                  {p.valor !== null && <span className="text-paper">{formatBRL(p.valor)}</span>}
                </div>
                {p.motivo && <p className="mt-1 text-xs text-muted">Motivo: {p.motivo}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Comprovantes por tipo */}
      <div className="mt-6 space-y-6">
        {ORDEM_TIPOS.map((tipo) => {
          const docs = docsPorTipo.get(tipo) || [];
          if (docs.length === 0) return null;
          return (
            <section key={tipo} className="animate-fade-up">
              <h2 className="mb-2.5 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-muted">
                {TITULOS[tipo]}
                <span className="rounded-full bg-onyx-elevated px-2 py-0.5 text-[11px] font-normal text-muted">
                  {docs.length}
                </span>
              </h2>
              <div className="space-y-2">
                {docs.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-onyx-border bg-onyx-soft/60 px-4 py-3 transition hover:border-orange/40 hover:bg-onyx-elevated"
                  >
                    <a
                      href={`/api/comprovante/${encodeURIComponent(d.id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange/10 text-orange">
                        <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.8}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-paper">{isoDateToBr(d.data)}</p>
                        <p className="text-xs text-muted">
                          {d.valor !== null ? formatBRL(d.valor) : "Valor não identificado"}
                          {d.complemento ? " · Complemento" : ""}
                          {d.origemUpload ? " · Enviado manualmente" : ""}
                        </p>
                      </div>
                    </a>
                    <div className="flex shrink-0 items-center gap-2">
                      {tipo === "NAO_IDENTIFICADO" && <ClassificarDocumento documentoId={d.id} />}
                      <SituacaoBadge situacao={d.situacao} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        {documentosDoFuncionario.length === 0 && (
          <div className="rounded-xl border border-dashed border-onyx-border px-5 py-8 text-center text-sm text-muted">
            Nenhum comprovante em PDF encontrado para este funcionário ainda.
          </div>
        )}
      </div>

      {/* Histórico oficial do relatório do banco */}
      {pagamentosDoFuncionario.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-2.5 font-display text-sm font-semibold uppercase tracking-wide text-muted">
            Histórico no relatório do banco
            <span className="ml-2 rounded-full bg-onyx-elevated px-2 py-0.5 text-[11px] font-normal text-muted">
              {pagamentosDoFuncionario.length}
            </span>
          </h2>
          <div className="overflow-hidden rounded-xl border border-onyx-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-onyx-elevated text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Data</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Valor</th>
                  <th className="px-3 py-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-onyx-border">
                {pagamentosDoFuncionario.map((p, i) => (
                  <PagamentoRow key={i} p={p} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-paper">{value}</dd>
    </div>
  );
}

function PagamentoRow({ p }: { p: PagamentoResolvido }) {
  const problema = p.situacao === "Cancelado" || p.situacao === "Rejeitado";
  return (
    <tr className={problema ? "bg-rose-500/[0.04]" : undefined}>
      <td className="px-3 py-2 text-muted">{isoDateToBr(p.data)}</td>
      <td className="px-3 py-2">
        <TipoBadge tipo={p.tipo} />
      </td>
      <td className="px-3 py-2 text-paper">{p.valor !== null ? formatBRL(p.valor) : "—"}</td>
      <td className="px-3 py-2">
        <SituacaoBadge situacao={p.situacao} />
      </td>
    </tr>
  );
}
