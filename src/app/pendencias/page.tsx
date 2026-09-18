"use client";

import { useRef, useState } from "react";

export default function PendenciasPage() {
  const [planilha, setPlanilha] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [resumo, setResumo] = useState<{
    total: number;
    pendente: number;
    pago: number;
    divergente: number;
    naoEncontrado: number;
  } | null>(null);
  const inputXlsxRef = useRef<HTMLInputElement>(null);

  async function verificar() {
    if (!planilha) return;
    setEnviando(true);
    setErro(null);
    setAvisos([]);
    setResumo(null);

    try {
      const form = new FormData();
      form.append("planilha", planilha);

      const res = await fetch("/api/verificar-pendencias", { method: "POST", body: form });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErro(data.erro || `Erro ${res.status} ao verificar.`);
        if (data.avisos) setAvisos(data.avisos);
        return;
      }

      const total = Number(res.headers.get("X-Total-Linhas") || 0);
      const pendente = Number(res.headers.get("X-Pendente-Confirmada") || 0);
      const pago = Number(res.headers.get("X-Ja-Pago") || 0);
      const divergente = Number(res.headers.get("X-Valor-Divergente") || 0);
      const naoEncontrado = Number(res.headers.get("X-Nao-Encontrado") || 0);
      setResumo({ total, pendente, pago, divergente, naoEncontrado });

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `verificacao-pendencias-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErro("Falha de conexão ao verificar as pendências.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
      <h1 className="font-display text-2xl font-semibold text-paper">Verificador de pendências</h1>
      <p className="mt-1.5 text-sm text-muted">
        Envie a planilha de pendência (qualquer formato — a leitura é automática). A ferramenta cruza
        automaticamente com a base de pagamentos já cadastrada e devolve uma planilha dizendo o que
        realmente ainda está pendente, o que já foi pago (pendência inexistente) e onde o valor
        pendente está desatualizado.
      </p>

      <div className="mt-8 space-y-10">
        <section>
          <h2 className="font-display text-base font-semibold text-paper">Planilha de pendência (.xlsx)</h2>
          <p className="mt-1 text-sm text-muted">
            Não precisa ter um formato específico — a ferramenta procura automaticamente as colunas de
            nome, CPF, valor e tipo (quando existir).
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              ref={inputXlsxRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => setPlanilha(e.target.files?.[0] || null)}
            />
            <button
              onClick={() => inputXlsxRef.current?.click()}
              className="rounded-lg border border-onyx-border bg-onyx-soft px-4 py-2 text-sm text-paper transition hover:border-orange/40"
            >
              Escolher planilha
            </button>
            {planilha && <span className="text-sm text-muted">{planilha.name}</span>}
          </div>
        </section>

        <button
          onClick={verificar}
          disabled={!planilha || enviando}
          className="w-full rounded-lg bg-orange px-4 py-3 text-sm font-medium text-onyx transition hover:bg-orange-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          {enviando ? "Verificando..." : "Verificar pendências"}
        </button>

        {erro && (
          <div className="rounded-lg border border-rose-500/25 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-300">
            {erro}
          </div>
        )}
        {avisos.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-xs text-amber-300">
            {avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        )}

        {resumo && (
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4">
            <p className="text-sm font-medium text-emerald-300">
              Planilha gerada e baixada — {resumo.total} linha{resumo.total !== 1 ? "s" : ""} verificada
              {resumo.total !== 1 ? "s" : ""}.
            </p>
            <ul className="mt-2 space-y-1 text-sm text-paper">
              <li>🔴 {resumo.pendente} pendência(s) confirmada(s) — realmente ainda deve</li>
              <li>🟡 {resumo.divergente} valor(es) divergente(s) — já pago, mas valor diferente do listado</li>
              <li>🟢 {resumo.pago} pendência(s) inexistente(s) — já foi pago certinho</li>
              <li>⚪ {resumo.naoEncontrado} não encontrado(s) — confira manualmente</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
