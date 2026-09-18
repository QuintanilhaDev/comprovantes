import * as XLSX from "xlsx";
import type { Funcionario } from "./types";
import { formatCpf, normalizeCpf, normalizeName, stripAccents } from "./normalize";

/**
 * Lê a planilha de funcionários (aba "BASE FATURAMENTO" ou a primeira disponível).
 *
 * IMPORTANTE: as colunas são localizadas pelo TEXTO do cabeçalho (ex: "CPF",
 * "BANCO", "OPTANTE DO VALE TRANSPORTE"), não pela posição/ordem delas na
 * planilha. Isso é proposital — se a planilha enviada tiver uma coluna a mais,
 * a menos, ou em outra ordem em relação à planilha original, os dados
 * continuam sendo lidos corretamente em vez de "deslizarem" para o campo
 * errado (o que já aconteceu antes: uma coluna removida fazia o BANCO cair no
 * campo ADMISSÃO, a AGÊNCIA cair no campo BANCO, e assim por diante).
 */
export function parseEmployeesSpreadsheet(bytes: Buffer): { funcionarios: Funcionario[]; avisos: string[] } {
  const avisos: string[] = [];
  const wb = XLSX.read(bytes, { type: "buffer", cellDates: true });

  const sheetName =
    wb.SheetNames.find((n) => n.toUpperCase().includes("BASE FATURAMENTO")) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });

  // Acha a linha de cabeçalho procurando a célula "NOME DO COLABORADOR" (ou só "NOME").
  let headerRowIdx = rows.findIndex((r) =>
    r.some((cell) => typeof cell === "string" && normalizarTexto(cell).includes("NOME DO COLABORADOR"))
  );
  if (headerRowIdx === -1) {
    headerRowIdx = rows.findIndex((r) => r.some((cell) => typeof cell === "string" && normalizarTexto(cell) === "NOME"));
  }
  if (headerRowIdx === -1) headerRowIdx = 0;

  const headerRow = Array.from(rows[headerRowIdx] || [], (c) => normalizarTexto(String(c ?? "")));
  const dataRows = rows.slice(headerRowIdx + 1);

  const col = {
    polo:
      encontrarColuna(headerRow, ["N DO POLO", "NUMERO DO POLO"]) !== -1
        ? encontrarColuna(headerRow, ["N DO POLO", "NUMERO DO POLO"])
        : encontrarColuna(headerRow, ["POLO"], ["MUNICIPIO", "ZONA"]),
    zonaEleitoral: encontrarColuna(headerRow, ["ZONA ELEITORAL"]),
    municipioZona: encontrarColuna(headerRow, ["MUNICIPIO DA ZONA", "MUNICIPIO ZONA"]),
    municipioPolo: encontrarColuna(headerRow, ["MUNICIPIO POLO", "MUNICIPIO DO POLO"]),
    nome: encontrarColuna(headerRow, ["NOME DO COLABORADOR", "NOME COLABORADOR", "NOME"]),
    cpf: encontrarColuna(headerRow, ["CPF"]),
    admissao: encontrarColuna(headerRow, ["ADMISSAO"]),
    banco: encontrarColuna(headerRow, ["BANCO"]),
    agencia: encontrarColuna(headerRow, ["AGENCIA"]),
    conta: encontrarColuna(headerRow, ["CONTA"], ["MUNICIPIO"]),
    optanteVT: encontrarColuna(headerRow, ["OPTANTE"]),
    telefone: encontrarColuna(headerRow, ["TELEFONE", "WHATSAPP", "CELULAR"]),
    desligamento: encontrarColuna(headerRow, ["DESLIGAMENTO"]),
    funcao: encontrarColuna(headerRow, ["FUNCAO"]),
    posicaoVaga: encontrarColuna(headerRow, ["POSICAO DA VAGA", "POSICAO"]),
    vinculo: encontrarColuna(headerRow, ["VINCULO NO POSTO", "VINCULO"]),
    status: encontrarColuna(headerRow, ["STATUS"]),
    substitui: encontrarColuna(headerRow, ["SUBSTITUI"]),
    observacao: encontrarColuna(headerRow, ["OBSERVACAO"]),
  };

  // Campos essenciais sem os quais não dá pra confiar na planilha.
  const faltando = (["nome", "cpf"] as const).filter((k) => col[k] === -1);
  if (faltando.length > 0) {
    avisos.push(
      `Não encontramos a(s) coluna(s) ${faltando.join(", ")} no cabeçalho da planilha. Confira se a aba "BASE FATURAMENTO" tem essas colunas com esse nome.`
    );
    return { funcionarios: [], avisos };
  }

  const avisosColunasOpcionais = (Object.keys(col) as (keyof typeof col)[]).filter(
    (k) => col[k] === -1 && k !== "nome" && k !== "cpf"
  );
  if (avisosColunasOpcionais.length > 0) {
    avisos.push(
      `Algumas colunas não foram encontradas e ficarão em branco: ${avisosColunasOpcionais.join(", ")}. Isso não afeta a busca por nome/CPF.`
    );
  }

  const get = (r: unknown[], idx: number) => (idx >= 0 ? r[idx] : undefined);

  const funcionarios: Funcionario[] = [];
  for (const r of dataRows) {
    const nomeRaw = get(r, col.nome);
    if (!nomeRaw || typeof nomeRaw !== "string" || !nomeRaw.trim()) continue;

    const cpfRaw = get(r, col.cpf);
    const cpf = normalizeCpf(typeof cpfRaw === "number" ? String(cpfRaw) : (cpfRaw as string));

    const admissao = toIsoMaybe(get(r, col.admissao));
    const desligamento = toIsoMaybe(get(r, col.desligamento));
    const optanteVTraw = get(r, col.optanteVT);
    const optanteVT = interpretarOptanteVT(optanteVTraw);

    funcionarios.push({
      cpf,
      cpfFormatado: formatCpf(cpf),
      nome: nomeRaw.trim(),
      nomeNorm: normalizeName(nomeRaw),
      polo: (get(r, col.polo) as number | string) ?? null,
      zonaEleitoral: (get(r, col.zonaEleitoral) as number | string) ?? null,
      municipioZona: (get(r, col.municipioZona) as string) ?? null,
      municipioPolo: (get(r, col.municipioPolo) as string) ?? null,
      admissao,
      banco: (get(r, col.banco) as string) ?? null,
      agencia: (get(r, col.agencia) as string) ?? null,
      conta: (get(r, col.conta) as string) ?? null,
      optanteVT,
      telefone: (get(r, col.telefone) as string) ?? null,
      desligamento,
      funcao: (get(r, col.funcao) as string) ?? null,
      posicaoVaga: (get(r, col.posicaoVaga) as string) ?? null,
      vinculo: (get(r, col.vinculo) as string) ?? null,
      status: ((get(r, col.status) as string) || "").trim().toUpperCase() || null,
      substitui: (get(r, col.substitui) as string) ?? null,
      observacao: (get(r, col.observacao) as string) ?? null,
    });
  }

  if (funcionarios.length === 0) {
    avisos.push(
      "Não encontramos nenhuma linha com nome de colaborador. Confira se a aba 'BASE FATURAMENTO' está presente e no mesmo formato da planilha original."
    );
  }

  return { funcionarios, avisos };
}

/** Maiúsculo, sem acento, só letras/números/espaço — para comparar cabeçalhos com tolerância a variações. */
function normalizarTexto(s: string): string {
  return stripAccents(s)
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Procura, na lista de cabeçalhos já normalizados, a primeira coluna cujo texto contenha
 * algum dos `candidatos` (em ordem de preferência) — e que não contenha nenhum dos
 * termos em `excluir` (para evitar colisão com colunas parecidas, ex: "POLO" dentro de
 * "MUNICÍPIO POLO").
 */
function encontrarColuna(headers: string[], candidatos: string[], excluir: string[] = []): number {
  for (const cand of candidatos) {
    const idx = headers.findIndex((h) => (h ?? "").includes(cand) && !excluir.some((ex) => (h ?? "").includes(ex)));
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * Interpreta a coluna "Optante do Vale Transporte" com tolerância a variações
 * (Sim/S/Verdadeiro/x ou Não/N/Falso), mas SEM adivinhar: se o valor não for
 * claramente um "sim" ou um "não" (por exemplo, se por algum desalinhamento de
 * coluna vier um telefone ou um código de banco), retorna null — "não sei" —
 * em vez de assumir false. Isso é importante porque, na hora de mesclar com os
 * dados já existentes, um valor desconhecido preserva o que já estava
 * cadastrado, em vez de apagar um "Sim" correto por engano.
 */
function interpretarOptanteVT(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  if (typeof raw !== "string") return null;
  const v = normalizarTexto(raw);
  if (["SIM", "S", "X", "VERDADEIRO", "TRUE", "1"].includes(v)) return true;
  if (["NAO", "N", "FALSO", "FALSE", "0"].includes(v)) return false;
  return null;
}

function toIsoMaybe(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string") {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(value);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return value;
  }
  return null;
}
