import * as XLSX from "xlsx";
import { normalizeCpf, normalizeName, parseBrValor, stripAccents } from "./normalize";
import type { TipoBeneficio } from "./types";

export interface LinhaPendencia {
  linhaOriginal: number;
  nome: string;
  nomeNorm: string;
  cpf: string | null;
  valor: number | null;
  tipo: TipoBeneficio | null;
}

function normalizarTexto(s: string): string {
  return stripAccents(s)
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pareceCpf(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  const digitos = String(v).replace(/\D/g, "");
  return digitos.length === 11;
}

function pareceValor(v: unknown): boolean {
  if (typeof v === "number") return v > 0 && v < 100000;
  if (typeof v !== "string") return false;
  return /^R?\$?\s*[\d.]+,\d{2}$/.test(v.trim()) || /^\d+([.,]\d{1,2})?$/.test(v.trim());
}

function pareceNome(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const palavras = v.trim().split(/\s+/);
  return palavras.length >= 2 && /^[A-Za-zÀ-ÿ\s'.-]+$/.test(v.trim());
}

function tipoDoTexto(raw: string): TipoBeneficio | null {
  const v = normalizarTexto(raw);
  if (/\bVT\b|TRANSPORTE/.test(v)) return "VT";
  if (/\bVA\b|AUXILIO/.test(v)) return "AUXILIO";
  if (/SALARIO/.test(v)) return "SALARIO";
  return null;
}

const CANDIDATOS_HEADER: Record<string, string[]> = {
  nome: ["NOME DO COLABORADOR", "NOME COLABORADOR", "NOME FUNCIONARIO", "FUNCIONARIO", "COLABORADOR", "NOME"],
  cpf: ["CPF"],
  valor: ["VALOR PENDENTE", "VALOR DEVIDO", "VALOR A PAGAR", "VALOR"],
  tipo: ["TIPO DE BENEFICIO", "TIPO BENEFICIO", "BENEFICIO", "TIPO"],
};

function encontrarColunaPorHeader(headers: string[], candidatos: string[]): number {
  for (const cand of candidatos) {
    const idx = headers.findIndex((h) => h === cand || (h ?? "").includes(cand));
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * Tenta achar a linha de cabeçalho e mapear as colunas pelo texto (Nome, CPF,
 * Valor, Tipo). Como a planilha de pendência não tem um formato fixo entre
 * remessas, isso é feito com uma lista de sinônimos.
 */
function detectarColunasPorHeader(rows: unknown[][]): { headerRowIdx: number; col: Record<string, number> } | null {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const linha = Array.from(rows[i], (c) => normalizarTexto(String(c ?? "")));
    if (linha.every((c) => !c)) continue;
    const colNome = encontrarColunaPorHeader(linha, CANDIDATOS_HEADER.nome);
    const colCpf = encontrarColunaPorHeader(linha, CANDIDATOS_HEADER.cpf);
    const colValor = encontrarColunaPorHeader(linha, CANDIDATOS_HEADER.valor);
    if (colNome !== -1 || colCpf !== -1) {
      return {
        headerRowIdx: i,
        col: {
          nome: colNome,
          cpf: colCpf,
          valor: colValor,
          tipo: encontrarColunaPorHeader(linha, CANDIDATOS_HEADER.tipo),
        },
      };
    }
  }
  return null;
}

/**
 * Quando não existe um cabeçalho reconhecível, tenta adivinhar as colunas
 * observando o CONTEÚDO das primeiras linhas de dados (ex: uma coluna onde a
 * maioria dos valores parece CPF é a coluna de CPF, etc).
 */
function detectarColunasPorConteudo(rows: unknown[][]): { headerRowIdx: number; col: Record<string, number> } {
  const amostraLinhas = rows.slice(0, Math.min(rows.length, 30));
  const numColunas = Math.max(...amostraLinhas.map((r) => r.length), 0);

  const pontuacao = { nome: new Array(numColunas).fill(0), cpf: new Array(numColunas).fill(0), valor: new Array(numColunas).fill(0), tipo: new Array(numColunas).fill(0) };

  for (const linha of amostraLinhas) {
    for (let c = 0; c < numColunas; c++) {
      const v = linha[c];
      if (v === undefined || v === null || v === "") continue;
      if (pareceCpf(v)) pontuacao.cpf[c]++;
      if (pareceValor(v)) pontuacao.valor[c]++;
      if (pareceNome(v)) pontuacao.nome[c]++;
      if (typeof v === "string" && tipoDoTexto(v)) pontuacao.tipo[c]++;
    }
  }

  function melhorColuna(scores: number[]): number {
    let melhorIdx = -1;
    let melhor = 0;
    scores.forEach((s, i) => {
      if (s > melhor) {
        melhor = s;
        melhorIdx = i;
      }
    });
    return melhor >= 2 ? melhorIdx : -1;
  }

  return {
    headerRowIdx: -1, // sem cabeçalho identificado — todas as linhas são dados
    col: {
      nome: melhorColuna(pontuacao.nome),
      cpf: melhorColuna(pontuacao.cpf),
      valor: melhorColuna(pontuacao.valor),
      tipo: melhorColuna(pontuacao.tipo),
    },
  };
}

export interface ResultadoLeituraPendencia {
  linhas: LinhaPendencia[];
  avisos: string[];
}

export function parsePlanilhaPendencia(bytes: Buffer): ResultadoLeituraPendencia {
  const avisos: string[] = [];
  const wb = XLSX.read(bytes, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });

  if (rows.length === 0) {
    return { linhas: [], avisos: ["A planilha está vazia."] };
  }

  let deteccao = detectarColunasPorHeader(rows);
  if (!deteccao || (deteccao.col.nome === -1 && deteccao.col.cpf === -1)) {
    avisos.push("Não encontramos um cabeçalho claro (Nome/CPF) — identificamos as colunas pelo conteúdo das linhas.");
    deteccao = detectarColunasPorConteudo(rows);
  }

  const { headerRowIdx, col } = deteccao;
  if (col.nome === -1 && col.cpf === -1) {
    avisos.push("Não conseguimos identificar nenhuma coluna de nome ou CPF nesta planilha.");
    return { linhas: [], avisos };
  }
  if (col.valor === -1) {
    avisos.push("Não conseguimos identificar a coluna de valor — os valores pendentes ficarão em branco.");
  }

  const dataRows = rows.slice(headerRowIdx + 1);
  const linhas: LinhaPendencia[] = [];

  dataRows.forEach((r, idx) => {
    const nomeRaw = col.nome !== -1 ? r[col.nome] : null;
    const cpfRaw = col.cpf !== -1 ? r[col.cpf] : null;
    if (!nomeRaw && !cpfRaw) return; // linha vazia/irrelevante

    const nome = typeof nomeRaw === "string" ? nomeRaw.trim() : nomeRaw ? String(nomeRaw) : "";
    const cpf = cpfRaw ? normalizeCpf(typeof cpfRaw === "number" ? String(cpfRaw) : (cpfRaw as string)) : null;
    const valorRaw = col.valor !== -1 ? r[col.valor] : null;
    const valor =
      typeof valorRaw === "number" ? Math.round(valorRaw * 100) / 100 : valorRaw ? parseBrValor(String(valorRaw)) : null;
    const tipoRaw = col.tipo !== -1 ? r[col.tipo] : null;
    const tipo = typeof tipoRaw === "string" ? tipoDoTexto(tipoRaw) : null;

    if (!nome && !cpf) return;

    linhas.push({
      linhaOriginal: headerRowIdx + idx + 2, // +2: 1-index + pula o cabeçalho
      nome: nome || cpf || "(sem nome)",
      nomeNorm: normalizeName(nome),
      cpf,
      valor,
      tipo,
    });
  });

  if (linhas.length === 0) {
    avisos.push("Nenhuma linha de dados foi reconhecida na planilha.");
  }

  return { linhas, avisos };
}
