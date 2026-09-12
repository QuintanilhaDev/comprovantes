"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import type { Funcionario } from "@/lib/types";

const CHAVE_RECENTES = "comprovantes-tre:recentes";
const MAX_RECENTES = 6;

type Recente = { id: string; nome: string };

function lerRecentes(): Recente[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CHAVE_RECENTES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function salvarRecente(item: Recente) {
  if (typeof window === "undefined") return;
  const atuais = lerRecentes().filter((r) => r.id !== item.id);
  const novos = [item, ...atuais].slice(0, MAX_RECENTES);
  window.localStorage.setItem(CHAVE_RECENTES, JSON.stringify(novos));
}

interface Resultado {
  id: string;
  funcionario: Funcionario;
  score: number;
  resumo: {
    totalDocumentos: number;
    totalPagamentos: number;
    ultimaAtualizacao: string | null;
    alertas: number;
  };
}

export default function SearchPanel() {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [buscou, setBuscou] = useState(false);
  const [recentes, setRecentes] = useState<Recente[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    setRecentes(lerRecentes());
    function onSlash(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onSlash);
    return () => window.removeEventListener("keydown", onSlash);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResultados([]);
      setBuscou(false);
      return;
    }
    setCarregando(true);
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        setResultados(data.resultados || []);
        setBuscou(true);
      } catch {
        // busca cancelada ou falhou silenciosamente — próxima tecla tentará de novo
      } finally {
        setCarregando(false);
      }
    }, 180);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 sm:px-6">
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
          />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          type="text"
          inputMode="search"
          placeholder="Nome ou CPF do funcionário..."
          className="w-full rounded-2xl border border-onyx-border bg-onyx-soft py-4 pl-12 pr-12 text-base text-paper placeholder:text-muted/70 shadow-[0_0_0_1px_rgba(0,0,0,0.2)] outline-none transition focus:border-orange/60 focus:shadow-glow"
          autoComplete="off"
          spellCheck={false}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="Limpar busca"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted transition hover:text-paper"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      <p className="mt-2 px-1 text-xs text-muted">
        Dica: não precisa digitar os pontos do CPF, e pequenos erros de digitação no nome também funcionam.
      </p>

      <div className="mt-5 space-y-2">
        {carregando && (
          <div className="flex items-center gap-2 px-1 py-3 text-sm text-muted">
            <span className="h-2 w-2 animate-pulse-ring rounded-full bg-orange" />
            Buscando...
          </div>
        )}

        {!carregando && buscou && resultados.length === 0 && (
          <div className="animate-fade-up rounded-xl border border-onyx-border bg-onyx-soft/60 px-5 py-6 text-center text-sm text-muted">
            Nenhum funcionário encontrado para <span className="text-paper">&ldquo;{query}&rdquo;</span>.
            <br />
            Confira a grafia do nome ou os dígitos do CPF.
          </div>
        )}

        {!carregando &&
          resultados.map((r, i) => (
            <Link
              key={r.id}
              href={`/funcionario/${encodeURIComponent(r.id)}`}
              onClick={() => salvarRecente({ id: r.id, nome: r.funcionario.nome })}
              className="group flex animate-fade-up items-center justify-between gap-3 rounded-xl border border-onyx-border bg-onyx-soft/70 px-4 py-3.5 transition hover:border-orange/40 hover:bg-onyx-elevated sm:px-5"
              style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium text-paper">{r.funcionario.nome}</p>
                  {r.funcionario.status && r.funcionario.status !== "ATIVO" && (
                    <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                      {r.funcionario.status}
                    </span>
                  )}
                  {r.resumo.alertas > 0 && (
                    <span className="shrink-0 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-300">
                      {r.resumo.alertas} alerta{r.resumo.alertas > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {r.funcionario.cpfFormatado && (
                    <span className="font-mono">{r.funcionario.cpfFormatado}</span>
                  )}
                  {r.funcionario.funcao && <span> · {r.funcionario.funcao}</span>}
                  {r.funcionario.municipioPolo && <span> · {r.funcionario.municipioPolo}</span>}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <div className="hidden text-right text-xs text-muted sm:block">
                  <p>
                    {r.resumo.totalDocumentos} comprovante{r.resumo.totalDocumentos !== 1 ? "s" : ""}
                  </p>
                  <p>
                    {r.resumo.totalPagamentos} registro{r.resumo.totalPagamentos !== 1 ? "s" : ""}
                  </p>
                </div>
                <svg
                  className={clsx(
                    "h-4 w-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-orange"
                  )}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}

        {!query && recentes.length > 0 && (
          <div className="animate-fade-up">
            <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted">Buscas recentes</p>
            <div className="flex flex-wrap gap-2">
              {recentes.map((r) => (
                <Link
                  key={r.id}
                  href={`/funcionario/${encodeURIComponent(r.id)}`}
                  className="rounded-full border border-onyx-border bg-onyx-soft/60 px-3 py-1.5 text-xs text-muted transition hover:border-orange/40 hover:text-paper"
                >
                  {r.nome}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
