import ExcelJS from "exceljs";
import type { ResultadoPendencia, StatusPendencia } from "./verificarPendencias";

const COR_MARCA = "FFFF7A1A";
const COR_TITULO_BG = "FF15151A";
const COR_BORDA = "FFE2DCD0";

const STATUS_INFO: Record<StatusPendencia, { label: string; bg: string; txt: string }> = {
  PENDENTE_CONFIRMADA: { label: "Pendência confirmada", bg: "FFFCE7E9", txt: "FFB42318" },
  JA_PAGO: { label: "Já foi pago", bg: "FFE4F6EA", txt: "FF15803D" },
  VALOR_DIVERGENTE: { label: "Valor divergente", bg: "FFFFF4D6", txt: "FF92650A" },
  NAO_ENCONTRADO: { label: "Não encontrado", bg: "FFEDEBE6", txt: "FF6B6B70" },
};

function formatarValor(v: number | null): string {
  return v === null || v === undefined ? "—" : `R$ ${v.toFixed(2).replace(".", ",")}`;
}

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export async function gerarRelatorioPendencias(resultados: ResultadoPendencia[]): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Comprovantes TRE";
  wb.created = new Date();

  const dataGeracao = new Date().toLocaleString("pt-BR", { timeZone: "America/Bahia" });

  // ---------- Aba 1: Resumo ----------
  const wsResumo = wb.addWorksheet("Resumo");
  wsResumo.getColumn(1).width = 34;
  wsResumo.getColumn(2).width = 14;
  wsResumo.mergeCells(1, 1, 1, 2);
  wsResumo.getCell(1, 1).value = "Comprovantes TRE — Verificação de Pendências";
  wsResumo.getCell(1, 1).font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  wsResumo.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_TITULO_BG } };
  wsResumo.getRow(1).height = 26;
  wsResumo.mergeCells(2, 1, 2, 2);
  wsResumo.getCell(2, 1).value = `Gerado em ${dataGeracao}`;
  wsResumo.getCell(2, 1).font = { italic: true, size: 10, color: { argb: "FFFFFFFF" } };
  wsResumo.getCell(2, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_TITULO_BG } };

  const contagem: Record<StatusPendencia, number> = {
    PENDENTE_CONFIRMADA: 0,
    JA_PAGO: 0,
    VALOR_DIVERGENTE: 0,
    NAO_ENCONTRADO: 0,
  };
  for (const r of resultados) contagem[r.status]++;

  let l = 4;
  wsResumo.getCell(l, 1).value = "Total de linhas verificadas";
  wsResumo.getCell(l, 1).font = { bold: true };
  wsResumo.getCell(l, 2).value = resultados.length;
  l += 2;
  (Object.keys(STATUS_INFO) as StatusPendencia[]).forEach((status) => {
    const info = STATUS_INFO[status];
    wsResumo.getCell(l, 1).value = info.label;
    wsResumo.getCell(l, 2).value = contagem[status];
    wsResumo.getCell(l, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: info.bg } };
    wsResumo.getCell(l, 1).font = { color: { argb: info.txt }, bold: true };
    wsResumo.getCell(l, 2).alignment = { horizontal: "right" };
    l++;
  });

  // ---------- Aba 2: Detalhe ----------
  const ws = wb.addWorksheet("Detalhe", { views: [{ state: "frozen", ySplit: 4 }] });
  const colunas = [
    { header: "Linha na planilha", width: 14 },
    { header: "Nome", width: 32 },
    { header: "CPF", width: 16 },
    { header: "Tipo considerado", width: 16 },
    { header: "Valor na planilha", width: 15 },
    { header: "Situação", width: 20 },
    { header: "Valor encontrado", width: 15 },
    { header: "Data encontrada", width: 14 },
    { header: "Observação", width: 55 },
  ];

  ws.mergeCells(1, 1, 1, colunas.length);
  ws.getCell(1, 1).value = "Comprovantes TRE — Verificação de Pendências (detalhe)";
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  ws.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_TITULO_BG } };
  ws.getRow(1).height = 26;
  ws.mergeCells(2, 1, 2, colunas.length);
  ws.getCell(2, 1).value = `Gerado em ${dataGeracao}`;
  ws.getCell(2, 1).font = { italic: true, size: 10, color: { argb: "FFFFFFFF" } };
  ws.getCell(2, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_TITULO_BG } };
  for (let c = 1; c <= colunas.length; c++) {
    ws.getCell(3, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_TITULO_BG } };
  }
  ws.getRow(3).height = 4;

  ws.getRow(4).values = colunas.map((c) => c.header);
  colunas.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));
  const headerRow = ws.getRow(4);
  headerRow.height = 22;
  for (let c = 1; c <= colunas.length; c++) {
    const cell = headerRow.getCell(c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_MARCA } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  }
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: colunas.length } };

  // Ordena: pendências confirmadas primeiro (o que mais importa), depois divergências, depois o resto.
  const ordem: Record<StatusPendencia, number> = { PENDENTE_CONFIRMADA: 0, VALOR_DIVERGENTE: 1, NAO_ENCONTRADO: 2, JA_PAGO: 3 };
  const ordenados = [...resultados].sort((a, b) => ordem[a.status] - ordem[b.status] || a.nome.localeCompare(b.nome));

  let linha = 5;
  for (const r of ordenados) {
    const row = ws.getRow(linha);
    row.getCell(1).value = r.linhaOriginal;
    row.getCell(2).value = r.nome;
    row.getCell(3).value = r.cpf ? r.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : "";
    row.getCell(4).value = r.tipoConsiderado || "—";
    row.getCell(5).value = formatarValor(r.valorNaPlanilha);
    row.getCell(6).value = STATUS_INFO[r.status].label;
    row.getCell(7).value = formatarValor(r.valorEncontrado);
    row.getCell(8).value = formatarData(r.dataEncontrada);
    row.getCell(9).value = r.observacao;

    const info = STATUS_INFO[r.status];
    row.getCell(6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: info.bg } };
    row.getCell(6).font = { color: { argb: info.txt }, bold: true };
    row.getCell(6).alignment = { horizontal: "center" };

    for (let c = 1; c <= colunas.length; c++) {
      row.getCell(c).border = { bottom: { style: "hair", color: { argb: COR_BORDA } } };
    }
    linha++;
  }

  const buffer = await wb.xlsx.writeBuffer();
  return buffer;
}
