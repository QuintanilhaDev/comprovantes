"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { SituacaoBadge, TipoBadge } from "@/components/Badge";
import { formatBRL, isoDateToBr } from "@/lib/normalize";
import type { PagamentoResolvido } from "@/lib/data";
import type { TipoBeneficio } from "@/lib/types";

const ORDEM_TIPOS: TipoBeneficio[] = ["SALARIO", "VT", "AUXILIO", "RESCISAO", "NAO_IDENTIFICADO"];

const TIPO_CARD_CONFIG: Record<TipoBeneficio, { label: string; dot: string; ring: string }> = {
  SALARIO: { label: "Salário", dot: "bg-sky-400", ring: "ring-sky-400/50 border-sky-500/40 bg-sky-500/[0.07]" },
  VT: { label: "Vale Transporte", dot: "bg-orange", ring: "ring-orange/50 border-orange/40 bg-orange/[0.07]" },
  AUXILIO: {
    label: "Auxílio (VA)",
    dot: "bg-amber-300",
    ring: "ring-amber-400/50 border-amber-400/40 bg-amber-400/[0.07]",
  },
  RESCISAO: {
    label: "Rescisão",
    dot: "bg-fuchsia-400",
    ring: "ring-fuchsia-500/50 border-fuchsia-500/40 bg-fuchsia-500/[0.07]",
  },
  NAO_IDENTIFICADO: { label: "Não identificado", dot: "bg-white/40", ring: "ring-white/30 border-white/20 bg-white/[0.04]" },
};

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function formatMonthLabel(ym: string): string {
  if (ym === "SEM_DATA") return "Sem data";
  const [ano, mes] = ym.split("-");
  const idx = parseInt(mes, 10) - 1;
  return `${MESES[idx] ?? mes}/${ano}`;
}

function monthKey(data: string | null): string {
  if (!data) return "SEM_DATA";
  const m = data.match(/^(\d{4}-\d{2})/);
  return m ? m[1] : "SEM_DATA";
}

export default function HistoricoPagamentos({ pagamentos }: { pagamentos: PagamentoResolvido[] }) {
  const [tipoSelecionado, setTipoSelecionado] = useState<TipoBeneficio | null>(null);
  const [mesSelecionado, setMesSelecionado] = useState<string>("all");

  const resumoPorTipo = useMemo(() => {
    const mapa = new Map<TipoBeneficio, { totalPago: number; qtdPago: number; qtdTotal: number }>();
    for (const tipo of ORDEM_TIPOS) mapa.set(tipo, { totalPago: 0, qtdPago: 0, qtdTotal: 0 });
    for (const p of pagamentos) {
      const atual = mapa.get(p.tipo) ?? { totalPago: 0, qtdPago: 0, qtdTotal: 0 };
      atual.qtdTotal += 1;
      if (p.situacao === "Pago" && p.valor !== null) {
        atual.totalPago += p.valor;
        atual.qtdPago += 1;
      }
      mapa.set(p.tipo, atual);
    }
    return mapa;
  }, [pagamentos]);

  const totalGeralPago = useMemo(
    () => pagamentos.reduce((soma, p) => (p.situacao === "Pago" && p.valor !== null ? soma + p.valor : soma), 0),
    [pagamentos]
  );

  const meses = useMemo(() => {
    const set = new Set<string>();
    for (const p of pagamentos) set.add(monthKey(p.data));
    return Array.from(set).sort((a, b) => (a === "SEM_DATA" ? 1 : b === "SEM_DATA" ? -1 : b.localeCompare(a)));
  }, [pagamentos]);

  const filtrados = useMemo(() => {
    return pagamentos.filter((p) => {
      if (tipoSelecionado && p.tipo !== tipoSelecionado) return false;
      if (mesSelecionado !== "all" && monthKey(p.data) !== mesSelecionado) return false;
      return true;
    });
  }, [pagamentos, tipoSelecionado, mesSelecionado]);

  const totalFiltradoPago = useMemo(
    () => filtrados.reduce((soma, p) => (p.situacao === "Pago" && p.valor !== null ? soma + p.valor : soma), 0),
    [filtrados]
  );

  const tiposComDados = ORDEM_TIPOS.filter((t) => (resumoPorTipo.get(t)?.qtdTotal ?? 0) > 0);
  const filtroAtivo = tipoSelecionado !== null || mesSelecionado !== "all";

  return (
    <div>
      {/* Cards de resumo por benefício */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => setTipoSelecionado(null)}
          className={clsx(
            "rounded-xl border px-3.5 py-3 text-left transition",
            tipoSelecionado === null
              ? "border-orange/50 bg-orange/[0.08] ring-1 ring-orange/40"
              : "border-onyx-border bg-onyx-soft/60 hover:border-white/20"
          )}
        >
          <p className="text-[11px] uppercase tracking-wide text-muted">Total geral pago</p>
          <p className="mt-1 font-display text-base font-semibold text-paper sm:text-lg">
            {formatBRL(totalGeralPago)}
          </p>
          <p className="mt-0.5 text-xs text-muted">{pagamentos.length} lançamento{pagamentos.length !== 1 ? "s" : ""}</p>
        </button>

        {tiposComDados.map((tipo) => {
          const resumo = resumoPorTipo.get(tipo)!;
          const cfg = TIPO_CARD_CONFIG[tipo];
          const selecionado = tipoSelecionado === tipo;
          return (
            <button
              key={tipo}
              type="button"
              onClick={() => setTipoSelecionado(selecionado ? null : tipo)}
              className={clsx(
                "rounded-xl border px-3.5 py-3 text-left transition",
                selecionado ? `ring-1 ${cfg.ring}` : "border-onyx-border bg-onyx-soft/60 hover:border-white/20"
              )}
            >
              <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted">
                <span className={clsx("h-1.5 w-1.5 rounded-full", cfg.dot)} />
                {cfg.label}
              </p>
              <p className="mt-1 font-display text-base font-semibold text-paper sm:text-lg">
                {formatBRL(resumo.totalPago)}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {resumo.qtdPago} pago{resumo.qtdPago !== 1 ? "s" : ""}
                {resumo.qtdTotal > resumo.qtdPago ? ` · ${resumo.qtdTotal - resumo.qtdPago} outro(s)` : ""}
              </p>
            </button>
          );
        })}
      </div>

      {/* Filtro por mês + resumo do filtro ativo */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="filtro-mes" className="text-xs text-muted">
            Período
          </label>
          <select
            id="filtro-mes"
            value={mesSelecionado}
            onChange={(e) => setMesSelecionado(e.target.value)}
            className="rounded-lg border border-onyx-border bg-onyx-soft px-2.5 py-1.5 text-sm text-paper outline-none transition focus:border-orange/50"
          >
            <option value="all">Todos os meses</option>
            {meses.map((m) => (
              <option key={m} value={m}>
                {formatMonthLabel(m)}
              </option>
            ))}
          </select>
        </div>

        {filtroAtivo && (
          <button
            type="button"
            onClick={() => {
              setTipoSelecionado(null);
              setMesSelecionado("all");
            }}
            className="text-xs text-muted underline-offset-2 transition hover:text-orange hover:underline"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Tabela filtrada */}
      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between text-xs text-muted">
          <span>
            {filtrados.length} lançamento{filtrados.length !== 1 ? "s" : ""}
            {filtroAtivo ? " (filtrado)" : ""}
          </span>
          {filtroAtivo && <span>Total pago no filtro: {formatBRL(totalFiltradoPago)}</span>}
        </div>

        {filtrados.length === 0 ? (
          <div className="rounded-xl border border-dashed border-onyx-border px-5 py-8 text-center text-sm text-muted">
            Nenhum pagamento encontrado para esse filtro.
          </div>
        ) : (
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
                {filtrados.map((p, i) => (
                  <PagamentoRow key={i} p={p} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
