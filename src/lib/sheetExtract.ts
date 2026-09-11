import * as XLSX from "xlsx";
import type { Funcionario } from "./types";
import { formatCpf, normalizeCpf, normalizeName } from "./normalize";

/**
 * Espera a mesma estrutura da planilha base (aba "BASE FATURAMENTO"), com cabeçalho
 * na primeira linha não vazia e as colunas, nesta ordem:
 * Nº DO POLO | ABA DE ORIGEM | ZONA ELEITORAL | MUNICÍPIO DA ZONA | MUNICÍPIO POLO |
 * ZONA POLO | NOME DO COLABORADOR | CPF | ADMISSÃO | BANCO | AGENCIA | CONTA |
 * OPTANTE DO VALE TRANSPORTE | TELEFONE / WHATSAPP | DESLIGAMENTO | FUNÇÃO |
 * POSIÇÃO DA VAGA | VÍNCULO NO POSTO | STATUS | SUBSTITUI / SUBSTITUÍDO(A) POR | OBSERVAÇÃO
 */
export function parseEmployeesSpreadsheet(bytes: Buffer): { funcionarios: Funcionario[]; avisos: string[] } {
  const avisos: string[] = [];
  const wb = XLSX.read(bytes, { type: "buffer", cellDates: true });

  const sheetName =
    wb.SheetNames.find((n) => n.toUpperCase().includes("BASE FATURAMENTO")) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });

  // Acha a linha de cabeçalho procurando "NOME DO COLABORADOR"
  let headerRowIdx = rows.findIndex((r) =>
    r.some((cell) => typeof cell === "string" && cell.toUpperCase().includes("NOME DO COLABORADOR"))
  );
  if (headerRowIdx === -1) headerRowIdx = 0;

  const dataRows = rows.slice(headerRowIdx + 1);

  const funcionarios: Funcionario[] = [];
  for (const r of dataRows) {
    const nome = r[6];
    if (!nome || typeof nome !== "string" || !nome.trim()) continue;

    const cpfRaw = r[7];
    const cpf = normalizeCpf(typeof cpfRaw === "number" ? String(cpfRaw) : (cpfRaw as string));

    const admissao = toIsoMaybe(r[8]);
    const desligamento = toIsoMaybe(r[14]);
    const optanteVTraw = r[12];
    const optanteVT = typeof optanteVTraw === "string" && optanteVTraw.trim().toUpperCase() === "SIM";

    funcionarios.push({
      cpf,
      cpfFormatado: formatCpf(cpf),
      nome: nome.trim(),
      nomeNorm: normalizeName(nome),
      polo: (r[0] as number | string) ?? null,
      zonaEleitoral: (r[2] as number | string) ?? null,
      municipioZona: (r[3] as string) ?? null,
      municipioPolo: (r[4] as string) ?? null,
      admissao,
      banco: (r[9] as string) ?? null,
      agencia: (r[10] as string) ?? null,
      conta: (r[11] as string) ?? null,
      optanteVT,
      telefone: (r[13] as string) ?? null,
      desligamento,
      funcao: (r[15] as string) ?? null,
      posicaoVaga: (r[16] as string) ?? null,
      vinculo: (r[17] as string) ?? null,
      status: ((r[18] as string) || "").trim().toUpperCase() || null,
      substitui: (r[19] as string) ?? null,
      observacao: (r[20] as string) ?? null,
    });
  }

  if (funcionarios.length === 0) {
    avisos.push(
      "Não encontramos nenhuma linha com nome de colaborador. Confira se a aba 'BASE FATURAMENTO' está presente e no mesmo formato da planilha original."
    );
  }

  return { funcionarios, avisos };
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
