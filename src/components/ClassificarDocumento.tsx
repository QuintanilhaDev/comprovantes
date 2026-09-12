"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TipoBeneficio } from "@/lib/types";

const OPCOES: { valor: TipoBeneficio; label: string }[] = [
  { valor: "SALARIO", label: "Salário" },
  { valor: "VT", label: "Vale Transporte" },
  { valor: "AUXILIO", label: "Auxílio (VA)" },
];

export default function ClassificarDocumento({ documentoId }: { documentoId: string }) {
  const [enviando, setEnviando] = useState(false);
  const router = useRouter();

  async function classificar(tipo: TipoBeneficio) {
    setEnviando(true);
    try {
      const res = await fetch(`/api/documento/${encodeURIComponent(documentoId)}/classificar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo }),
      });
      if (res.ok) router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <select
      disabled={enviando}
      defaultValue=""
      onClick={(e) => e.preventDefault()}
      onChange={(e) => {
        e.preventDefault();
        const v = e.target.value as TipoBeneficio;
        if (v) classificar(v);
      }}
      className="shrink-0 rounded-lg border border-onyx-border bg-onyx px-2 py-1 text-xs text-muted outline-none transition hover:border-orange/40 focus:border-orange/50 disabled:opacity-50"
      title="Classificar manualmente este comprovante"
    >
      <option value="" disabled>
        {enviando ? "Salvando..." : "Classificar"}
      </option>
      {OPCOES.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
