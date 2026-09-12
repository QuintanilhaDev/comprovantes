"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { TipoBeneficio } from "@/lib/types";

type ResultadoUpload = {
  arquivo: string;
  status: "ok" | "erro";
  detalhe?: string;
  nomeDetectado?: string | null;
  tipo?: TipoBeneficio;
  funcionarioEncontrado?: boolean;
  ehRelatorioEmLote?: boolean;
  linhasEncontradas?: number;
  linhasVinculadas?: number;
};

const TIPO_LABEL: Record<TipoBeneficio, string> = {
  SALARIO: "Salário",
  VT: "Vale Transporte",
  AUXILIO: "Auxílio (VA)",
  NAO_IDENTIFICADO: "Não identificado",
};

export default function AnexarPage() {
  const [avisoTemporario, setAvisoTemporario] = useState(false);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => setAvisoTemporario(!!d.armazenamentoTemporario))
      .catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
      <h1 className="font-display text-2xl font-semibold text-paper">Anexar arquivos</h1>
      <p className="mt-1.5 text-sm text-muted">
        Envie novos comprovantes em PDF assim que forem gerados, ou substitua a planilha de funcionários
        quando houver contratações ou desligamentos.
      </p>

      {avisoTemporario && (
        <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-200">
          <strong className="text-amber-300">Atenção:</strong> este site está hospedado no Vercel sem
          armazenamento permanente configurado. Os arquivos enviados aqui funcionam normalmente agora, mas
          podem ser perdidos depois de um tempo ou quando uma nova versão for publicada. Para tornar os
          uploads permanentes, configure o Vercel Blob (veja a seção 5 do README do projeto).
        </div>
      )}

      <div className="mt-8 space-y-10">
        <ComprovantesUploader />
        <PlanilhaUploader />
      </div>
    </div>
  );
}

// Limite de payload das funções serverless do Vercel: 4,5MB por requisição.
// Usamos uma margem de segurança e enviamos em lotes automáticos, em vez de
// tudo de uma vez — assim funciona mesmo anexando 100+ comprovantes juntos.
const MAX_BATCH_BYTES = 3.5 * 1024 * 1024;
const MAX_FILES_PER_BATCH = 25;
const MAX_SINGLE_FILE_BYTES = 4 * 1024 * 1024;

function montarLotes(arquivos: File[]): { lotes: File[][]; grandesDemais: File[] } {
  const grandesDemais = arquivos.filter((f) => f.size > MAX_SINGLE_FILE_BYTES);
  const elegiveis = arquivos.filter((f) => f.size <= MAX_SINGLE_FILE_BYTES);

  const lotes: File[][] = [];
  let atual: File[] = [];
  let tamanhoAtual = 0;

  for (const f of elegiveis) {
    const estourouTamanho = tamanhoAtual + f.size > MAX_BATCH_BYTES;
    const estourouQtd = atual.length >= MAX_FILES_PER_BATCH;
    if ((estourouTamanho || estourouQtd) && atual.length > 0) {
      lotes.push(atual);
      atual = [];
      tamanhoAtual = 0;
    }
    atual.push(f);
    tamanhoAtual += f.size;
  }
  if (atual.length > 0) lotes.push(atual);

  return { lotes, grandesDemais };
}

function ComprovantesUploader() {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [tipo, setTipo] = useState<TipoBeneficio | "AUTO">("AUTO");
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [resultados, setResultados] = useState<ResultadoUpload[] | null>(null);
  const [reclassificados, setReclassificados] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const pdfs = Array.from(fileList).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    setArquivos((prev) => {
      const nomesExistentes = new Set(prev.map((f) => f.name + f.size));
      const novos = pdfs.filter((f) => !nomesExistentes.has(f.name + f.size));
      return [...prev, ...novos];
    });
  }, []);

  async function enviar() {
    if (arquivos.length === 0) return;
    setEnviando(true);
    setResultados([]);
    setReclassificados(0);

    const { lotes, grandesDemais } = montarLotes(arquivos);

    let acumulado: ResultadoUpload[] = grandesDemais.map((f) => ({
      arquivo: f.name,
      status: "erro",
      detalhe: `Arquivo maior que ${(MAX_SINGLE_FILE_BYTES / (1024 * 1024)).toFixed(1)}MB — o servidor não aceita um único PDF tão grande. Comprima o arquivo e tente de novo.`,
    }));
    setResultados(acumulado);
    let totalReclassificados = 0;

    for (let i = 0; i < lotes.length; i++) {
      const lote = lotes[i];
      setProgresso(
        `Enviando lote ${i + 1} de ${lotes.length} (${lote.length} arquivo${lote.length > 1 ? "s" : ""})...`
      );
      try {
        const form = new FormData();
        for (const f of lote) form.append("files", f);
        if (tipo !== "AUTO") form.append("tipo", tipo);

        const res = await fetch("/api/upload", { method: "POST", body: form });
        if (res.ok) {
          const data = await res.json();
          acumulado = [...acumulado, ...(data.resultados || [])];
          totalReclassificados += data.reclassificados || 0;
        } else {
          let detalhe = `O servidor recusou este lote (erro ${res.status}).`;
          if (res.status === 413) {
            detalhe = "Lote ainda ficou grande demais para o servidor. Tente enviar menos arquivos de uma vez.";
          }
          acumulado = [...acumulado, ...lote.map((f) => ({ arquivo: f.name, status: "erro" as const, detalhe }))];
        }
      } catch {
        acumulado = [
          ...acumulado,
          ...lote.map((f) => ({ arquivo: f.name, status: "erro" as const, detalhe: "Falha de conexão ao enviar este lote." })),
        ];
      }
      setResultados([...acumulado]);
      setReclassificados(totalReclassificados);
    }

    setProgresso(null);
    setEnviando(false);
    const semErro = acumulado.every((r) => r.status === "ok");
    if (semErro) setArquivos([]);
    else setArquivos((prev) => prev.filter((f) => acumulado.find((r) => r.arquivo === f.name)?.status === "erro"));
  }

  return (
    <section>
      <h2 className="font-display text-base font-semibold text-paper">Novos comprovantes (PDF)</h2>
      <p className="mt-1 text-sm text-muted">
        Aceita tanto comprovantes individuais (um PDF por funcionário) quanto relatórios em lote do banco
        (uma tabela com vários funcionários, tipo &ldquo;Retorno Bancário&rdquo; ou &ldquo;PIX VT e VA&rdquo;) — a
        ferramenta identifica automaticamente qual é qual, e usa os relatórios em lote para reclassificar
        comprovantes antigos que ainda estavam sem tipo definido.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={clsx(
          "mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition",
          dragOver ? "border-orange bg-orange/5" : "border-onyx-border bg-onyx-soft/40 hover:border-orange/40"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
        <svg className="h-7 w-7 text-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.6}
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 8.25L12 3.75m0 0L7.5 8.25M12 3.75v12.75"
          />
        </svg>
        <p className="text-sm text-paper">Arraste os PDFs aqui ou clique para escolher</p>
        <p className="text-xs text-muted">Você pode selecionar vários arquivos de uma vez</p>
      </div>

      {arquivos.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {arquivos.map((f, i) => (
            <div
              key={f.name + f.size}
              className="flex items-center justify-between rounded-lg border border-onyx-border bg-onyx-soft/50 px-3 py-2 text-sm"
            >
              <span className="truncate text-paper">{f.name}</span>
              <button
                onClick={() => setArquivos((prev) => prev.filter((_, idx) => idx !== i))}
                className="ml-2 shrink-0 text-muted hover:text-rose-400"
                aria-label="Remover arquivo"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="text-sm text-muted">
          Tipo{" "}
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoBeneficio | "AUTO")}
            className="ml-1.5 rounded-lg border border-onyx-border bg-onyx-soft px-2.5 py-1.5 text-sm text-paper outline-none focus:border-orange/50"
          >
            <option value="AUTO">Detectar automaticamente</option>
            <option value="SALARIO">Salário</option>
            <option value="VT">Vale Transporte</option>
            <option value="AUXILIO">Auxílio (VA)</option>
          </select>
        </label>

        <button
          onClick={enviar}
          disabled={arquivos.length === 0 || enviando}
          className="ml-auto rounded-lg bg-orange px-4 py-2 text-sm font-medium text-onyx transition hover:bg-orange-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          {enviando
            ? progresso || "Enviando..."
            : `Enviar ${arquivos.length || ""} comprovante${arquivos.length === 1 ? "" : "s"}`}
        </button>
      </div>

      {arquivos.length > 5 && !enviando && (
        <p className="mt-2 text-xs text-muted">
          Arquivos grandes ou em grande quantidade são enviados automaticamente em vários lotes pequenos, para
          não esbarrar no limite do servidor.
        </p>
      )}

      {resultados && (
        <div className="mt-5 space-y-1.5">
          {reclassificados > 0 && (
            <div className="mb-2 rounded-lg border border-orange/30 bg-orange/[0.08] px-3 py-2 text-sm text-orange">
              ✨ {reclassificados} comprovante{reclassificados > 1 ? "s" : ""} que antes estava
              {reclassificados > 1 ? "m" : ""} como &ldquo;não identificado&rdquo; {reclassificados > 1 ? "foram" : "foi"}{" "}
              reclassificado{reclassificados > 1 ? "s" : ""} automaticamente com base nestes relatórios.
            </div>
          )}
          {resultados.map((r, i) => (
            <div
              key={i}
              className={clsx(
                "rounded-lg border px-3 py-2 text-sm",
                r.status === "ok"
                  ? "border-emerald-500/25 bg-emerald-500/[0.06]"
                  : "border-rose-500/25 bg-rose-500/[0.06]"
              )}
            >
              <p className="truncate text-paper">{r.arquivo}</p>
              {r.status === "ok" && r.ehRelatorioEmLote ? (
                <p className="mt-0.5 text-xs text-muted">
                  <span className="text-sky-300">Relatório em lote detectado</span> · {r.linhasEncontradas} registro
                  {r.linhasEncontradas !== 1 ? "s" : ""} encontrado{r.linhasEncontradas !== 1 ? "s" : ""} ·{" "}
                  {r.linhasVinculadas} vinculado{r.linhasVinculadas !== 1 ? "s" : ""} a funcionários da planilha
                </p>
              ) : r.status === "ok" ? (
                <p className="mt-0.5 text-xs text-muted">
                  {r.nomeDetectado && <span>Nome: {r.nomeDetectado} · </span>}
                  {r.tipo && <span>Tipo: {TIPO_LABEL[r.tipo]} · </span>}
                  {r.funcionarioEncontrado === false && (
                    <span className="text-amber-300">funcionário não está na planilha atual</span>
                  )}
                  {r.funcionarioEncontrado === true && <span className="text-emerald-300">vinculado ✓</span>}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-rose-300">{r.detalhe || "Não foi possível processar."}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PlanilhaUploader() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok?: boolean; erro?: string; totalFuncionarios?: number; avisos?: string[] } | null>(
    null
  );
  const inputRef = useRef<HTMLInputElement>(null);

  async function enviar() {
    if (!arquivo) return;
    setEnviando(true);
    setResultado(null);
    try {
      const form = new FormData();
      form.append("file", arquivo);
      const res = await fetch("/api/upload-planilha", { method: "POST", body: form });
      const data = await res.json();
      setResultado(data);
      if (res.ok) {
        setArquivo(null);
        setConfirmando(false);
      }
    } catch {
      setResultado({ erro: "Falha de conexão ao enviar a planilha." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section>
      <h2 className="font-display text-base font-semibold text-paper">Atualizar planilha de funcionários</h2>
      <p className="mt-1 text-sm text-muted">
        Envie a nova versão da planilha (mesmo formato da original, aba <code className="text-orange/90">BASE FATURAMENTO</code>) sempre que houver admissão ou desligamento. Isso{" "}
        <strong className="text-paper">substitui</strong> a lista de funcionários usada na busca — o
        histórico de comprovantes já enviados não é apagado.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            setArquivo(e.target.files?.[0] || null);
            setConfirmando(false);
            setResultado(null);
          }}
        />
        <button
          onClick={() => inputRef.current?.click()}
          className="rounded-lg border border-onyx-border bg-onyx-soft px-4 py-2 text-sm text-paper transition hover:border-orange/40"
        >
          Escolher planilha (.xlsx)
        </button>
        {arquivo && <span className="text-sm text-muted">{arquivo.name}</span>}
      </div>

      {arquivo && !confirmando && (
        <button
          onClick={() => setConfirmando(true)}
          className="mt-4 rounded-lg bg-orange px-4 py-2 text-sm font-medium text-onyx transition hover:bg-orange-soft"
        >
          Continuar
        </button>
      )}

      {confirmando && (
        <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-4">
          <p className="text-sm text-paper">
            Tem certeza? Isso vai substituir a base de <strong>{arquivo?.name}</strong> como lista oficial de
            funcionários usada na busca.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={enviar}
              disabled={enviando}
              className="rounded-lg bg-amber-400 px-3.5 py-1.5 text-sm font-medium text-onyx transition hover:bg-amber-300 disabled:opacity-50"
            >
              {enviando ? "Enviando..." : "Sim, substituir"}
            </button>
            <button
              onClick={() => setConfirmando(false)}
              className="rounded-lg border border-onyx-border px-3.5 py-1.5 text-sm text-muted transition hover:text-paper"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {resultado && (
        <div
          className={clsx(
            "mt-4 rounded-lg border px-4 py-3 text-sm",
            resultado.erro
              ? "border-rose-500/25 bg-rose-500/[0.06] text-rose-300"
              : "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-300"
          )}
        >
          {resultado.erro || `Planilha atualizada: ${resultado.totalFuncionarios} funcionários carregados.`}
          {resultado.avisos && resultado.avisos.length > 0 && (
            <ul className="mt-1.5 list-disc pl-4 text-xs text-amber-300">
              {resultado.avisos.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
