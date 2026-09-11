import clsx from "clsx";
import type { Situacao, TipoBeneficio } from "@/lib/types";

const TIPO_CONFIG: Record<TipoBeneficio, { label: string; className: string }> = {
  SALARIO: { label: "Salário", className: "bg-sky-500/10 text-sky-300 border-sky-500/30" },
  VT: { label: "Vale Transporte", className: "bg-orange/10 text-orange border-orange/35" },
  AUXILIO: { label: "Auxílio (VA)", className: "bg-amber-400/10 text-amber-300 border-amber-400/30" },
  NAO_IDENTIFICADO: { label: "Não identificado", className: "bg-white/5 text-muted border-white/10" },
};

const SITUACAO_CONFIG: Record<Situacao, { label: string; className: string; dot: string }> = {
  Pago: { label: "Pago", className: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30", dot: "bg-emerald-400" },
  Cancelado: { label: "Cancelado", className: "bg-rose-500/10 text-rose-300 border-rose-500/30", dot: "bg-rose-400" },
  Rejeitado: { label: "Rejeitado", className: "bg-rose-500/10 text-rose-300 border-rose-500/30", dot: "bg-rose-400" },
  Pendente: { label: "Pendente", className: "bg-amber-400/10 text-amber-300 border-amber-400/30", dot: "bg-amber-300" },
};

export function TipoBadge({ tipo, className }: { tipo: TipoBeneficio; className?: string }) {
  const cfg = TIPO_CONFIG[tipo] || TIPO_CONFIG.NAO_IDENTIFICADO;
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        cfg.className,
        className
      )}
    >
      {cfg.label}
    </span>
  );
}

export function SituacaoBadge({ situacao, className }: { situacao: Situacao; className?: string }) {
  const cfg = SITUACAO_CONFIG[situacao] || SITUACAO_CONFIG.Pendente;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        cfg.className,
        className
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}
