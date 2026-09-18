"use client";

import { useCallback, useRef, useState } from "react";
import clsx from "clsx";

const MAX_PDF_BYTES = 4 * 1024 * 1024;

export default function PendenciasPage() {
  const [relatorios, setRelatorios] = useState<File[]>([]);
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
  const [dragOverPdf, setDragOverPdf] = useState(false);
  const inputPdfRef = useRef<HTMLInputElement>(null);
  const inputXlsxRef = useRef<HTMLInputElement>(null);

  const addRelatorios = useCallback((fileList: FileList | File[]) => {
    const pdfs = Array.from(fileList).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    setRelatorios((prev) => {
      const existentes = new Set(prev.map((f) => f.name + f.size));
      const novos = pdfs.filter((f) => !existentes.has(f.name + f.size));
      return [...prev, ...novos];
    });
  }, []);

  const arquivosGrandesDemais = relatorios.filter((f) => f.size > MAX_PDF_BYTES);

  async function verificar() {
    if (relatorios.length === 0 || !planilha) return;
    setEnviando(true);
    setErro(null);
    setAvisos([]);
    setResumo(null);

    try {
      const form = new FormData();
      for (const f of relatorios) form.append("relatorios", f);
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
        Envie a planilha de pendência (qualquer formato — a leitura é automática) e os relatórios de
        pagamentos já realizados. A ferramenta cruza os dois e devolve uma planilha dizendo o que
        realmente ainda está pendente, o que já foi pago (pendência inexistente) e onde o valor
        pendente está desatualizado.
      </p>

      <div className="mt-8 space-y-10">
        <section>
          <h2 className="font-display text-base font-semibold text-paper">
            1. Relatórios de pagamentos realizados (PDF)
          </h2>
          <p className="mt-1 text-sm text-muted">
            O relatório "Pagamentos Realizados" do banco, ou os relatórios de lote já usados no resto da
            ferramenta. Pode enviar mais de um arquivo (ex: um por quinzena) — isso também ajuda a
            contornar o limite de tamanho por arquivo.
          </p>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverPdf(true);
            }}
            onDragLeave={() => setDragOverPdf(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverPdf(false);
              addRelatorios(e.dataTransfer.files);
            }}
            onClick={() => inputPdfRef.current?.click()}
            className={clsx(
              "mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition",
              dragOverPdf ? "border-orange bg-orange/5" : "border-onyx-border bg-onyx-soft/40 hover:border-orange/40"
            )}
          >
            <input
              ref={inputPdfRef}
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && addRelatorios(e.target.files)}
            />
            <svg className="h-6 w-6 text-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.6}
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 8.25L12 3.75m0 0L7.5 8.25M12 3.75v12.75"
              />
            </svg>
            <p className="text-sm text-paper">Arraste os PDFs aqui ou clique para escolher</p>
          </div>

          {relatorios.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {relatorios.map((f, i) => {
                const grandeDemais = f.size > MAX_PDF_BYTES;
                return (
                  <div
                    key={f.name + f.size}
                    className={clsx(
                      "flex items-center justify-between rounded-lg border px-3 py-2 text-sm",
                      grandeDemais ? "border-rose-500/30 bg-rose-500/[0.06]" : "border-onyx-border bg-onyx-soft/50"
                    )}
                  >
                    <span className={clsx("truncate", grandeDemais ? "text-rose-300" : "text-paper")}>
                      {f.name} {grandeDemais && `— ${(f.size / (1024 * 1024)).toFixed(1)}MB, acima do limite de 4MB`}
                    </span>
                    <button
                      onClick={() => setRelatorios((prev) => prev.filter((_, idx) => idx !== i))}
                      className="ml-2 shrink-0 text-muted hover:text-rose-400"
                      aria-label="Remover arquivo"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <h2 className="font-display text-base font-semibold text-paper">2. Planilha de pendência (.xlsx)</h2>
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
          disabled={relatorios.length === 0 || !planilha || enviando || arquivosGrandesDemais.length > 0}
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
