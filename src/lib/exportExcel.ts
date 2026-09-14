import ExcelJS from "exceljs";
import type { Funcionario } from "./types";
import type { DocumentoResolvido, PagamentoResolvido } from "./data";
import { formatBRL, isoDateToBr } from "./normalize";
import { employeeId } from "./employeeId";

const COR_MARCA = "FFFF7A1A"; // laranja da ferramenta
const COR_TITULO_BG = "FF15151A";
const COR_ZEBRA = "FFF6F3EE";
const COR_BORDA = "FFE2DCD0";

const COR_PAGO_BG = "FFE4F6EA";
const COR_PAGO_TXT = "FF15803D";
const COR_PROBLEMA_BG = "FFFCE7E9";
const COR_PROBLEMA_TXT = "FFB42318";
const COR_PENDENTE_BG = "FFFFF4D6";
const COR_PENDENTE_TXT = "FF92650A";

const TIPO_LABEL: Record<string, string> = {
  SALARIO: "Salário",
  VT: "Vale Transporte",
  AUXILIO: "Auxílio (VA)",
  NAO_IDENTIFICADO: "Não identificado",
};

function estilizarCabecalho(ws: ExcelJS.Worksheet, linha: number, ultimaColuna: number) {
  const row = ws.getRow(linha);
  row.height = 22;
  for (let c = 1; c <= ultimaColuna; c++) {
    const cell = row.getCell(c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_MARCA } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = { bottom: { style: "thin", color: { argb: COR_MARCA } } };
  }
}

function adicionarFaixaDeTitulo(ws: ExcelJS.Worksheet, titulo: string, subtitulo: string, colunas: number) {
  ws.mergeCells(1, 1, 1, colunas);
  const tituloCell = ws.getCell(1, 1);
  tituloCell.value = titulo;
  tituloCell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  tituloCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_TITULO_BG } };
  tituloCell.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(1).height = 26;

  ws.mergeCells(2, 1, 2, colunas);
  const subCell = ws.getCell(2, 1);
  subCell.value = subtitulo;
  subCell.font = { italic: true, size: 10, color: { argb: "FFFFFFFF" } };
  subCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_TITULO_BG } };
  subCell.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(2).height = 18;

  for (let c = 1; c <= colunas; c++) {
    ws.getCell(3, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_TITULO_BG } };
  }
  ws.getRow(3).height = 4;
}

function zebrarLinhas(ws: ExcelJS.Worksheet, primeiraLinhaDados: number, ultimaLinha: number, ultimaColuna: number) {
  for (let l = primeiraLinhaDados; l <= ultimaLinha; l++) {
    if ((l - primeiraLinhaDados) % 2 === 1) {
      for (let c = 1; c <= ultimaColuna; c++) {
        const cell = ws.getCell(l, c);
        if (!cell.fill || (cell.fill as ExcelJS.FillPattern).fgColor === undefined) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_ZEBRA } };
        }
      }
    }
    for (let c = 1; c <= ultimaColuna; c++) {
      ws.getCell(l, c).border = { bottom: { style: "hair", color: { argb: COR_BORDA } } };
    }
  }
}

function corSituacao(situacao: string): { bg: string; txt: string } {
  if (situacao === "Pago") return { bg: COR_PAGO_BG, txt: COR_PAGO_TXT };
  if (situacao === "Cancelado" || situacao === "Rejeitado") return { bg: COR_PROBLEMA_BG, txt: COR_PROBLEMA_TXT };
  return { bg: COR_PENDENTE_BG, txt: COR_PENDENTE_TXT };
}

export async function gerarPlanilhaGeral(
  funcionarios: Funcionario[],
  pagamentos: PagamentoResolvido[],
  documentos: DocumentoResolvido[]
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Comprovantes TRE";
  wb.created = new Date();

  const agora = new Date();
  const dataGeracao = agora.toLocaleString("pt-BR");

  // ---------- Aba 1: Pagamentos (uma linha por pagamento, com os dados do funcionário) ----------
  const wsPag = wb.addWorksheet("Pagamentos", { views: [{ state: "frozen", ySplit: 4 }] });
  const colunasPag = [
    { header: "Funcionário", key: "nome", width: 34 },
    { header: "CPF", key: "cpf", width: 16 },
    { header: "Função", key: "funcao", width: 26 },
    { header: "Município (Polo)", key: "municipio", width: 22 },
    { header: "Tipo", key: "tipo", width: 16 },
    { header: "Data", key: "data", width: 12 },
    { header: "Valor (R$)", key: "valor", width: 13 },
    { header: "Situação", key: "situacao", width: 13 },
    { header: "Período/Folha", key: "periodo", width: 26 },
    { header: "Fonte", key: "fonte", width: 34 },
  ];
  adicionarFaixaDeTitulo(wsPag, "Comprovantes TRE — Pagamentos", `Gerado em ${dataGeracao}`, colunasPag.length);
  wsPag.getRow(4).values = colunasPag.map((c) => c.header);
  colunasPag.forEach((c, i) => {
    wsPag.getColumn(i + 1).width = c.width;
  });
  estilizarCabecalho(wsPag, 4, colunasPag.length);

  const funcionarioPorId = new Map(funcionarios.map((f) => [employeeId(f), f]));

  const pagamentosOrdenados = [...pagamentos].sort((a, b) => {
    const nomeA = a.funcionarioResolvidoId ? funcionarioPorId.get(a.funcionarioResolvidoId)?.nome || a.nome : a.nome;
    const nomeB = b.funcionarioResolvidoId ? funcionarioPorId.get(b.funcionarioResolvidoId)?.nome || b.nome : b.nome;
    return nomeA.localeCompare(nomeB) || (a.data || "").localeCompare(b.data || "");
  });

  let linha = 5;
  for (const p of pagamentosOrdenados) {
    const f = p.funcionarioResolvidoId ? funcionarioPorId.get(p.funcionarioResolvidoId) : undefined;
    const row = wsPag.getRow(linha);
    row.getCell(1).value = f?.nome || p.nome;
    row.getCell(2).value = f?.cpfFormatado || "";
    row.getCell(3).value = f?.funcao || "";
    row.getCell(4).value = f?.municipioPolo || "";
    row.getCell(5).value = TIPO_LABEL[p.tipo] || p.tipo;
    row.getCell(6).value = p.data ? isoDateToBr(p.data) : "—";
    row.getCell(7).value = p.valor ?? 0;
    row.getCell(7).numFmt = '"R$" #,##0.00';
    row.getCell(8).value = p.situacao;
    row.getCell(9).value = p.periodo || "";
    row.getCell(10).value = p.fonteArquivo || "";

    const { bg, txt } = corSituacao(p.situacao);
    row.getCell(8).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    row.getCell(8).font = { color: { argb: txt }, bold: true };
    row.getCell(8).alignment = { horizontal: "center" };

    linha++;
  }
  const ultimaLinhaPag = linha - 1;
  zebrarLinhas(wsPag, 5, ultimaLinhaPag, colunasPag.length);
  wsPag.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: colunasPag.length } };

  // ---------- Aba 2: Funcionários (um por linha, dados de cadastro) ----------
  const wsFunc = wb.addWorksheet("Funcionários", { views: [{ state: "frozen", ySplit: 4 }] });
  const colunasFunc = [
    { header: "Nome", width: 34 },
    { header: "CPF", width: 16 },
    { header: "Status", width: 12 },
    { header: "Função", width: 26 },
    { header: "Vínculo", width: 12 },
    { header: "Município (Polo)", width: 22 },
    { header: "Admissão", width: 12 },
    { header: "Optante VT", width: 12 },
    { header: "Banco", width: 10 },
    { header: "Agência", width: 10 },
    { header: "Conta", width: 12 },
    { header: "Telefone", width: 16 },
    { header: "Total Comprovantes", width: 16 },
    { header: "Total Pagamentos", width: 15 },
    { header: "Alertas", width: 10 },
  ];
  adicionarFaixaDeTitulo(wsFunc, "Comprovantes TRE — Funcionários", `Gerado em ${dataGeracao}`, colunasFunc.length);
  wsFunc.getRow(4).values = colunasFunc.map((c) => c.header);
  colunasFunc.forEach((c, i) => {
    wsFunc.getColumn(i + 1).width = c.width;
  });
  estilizarCabecalho(wsFunc, 4, colunasFunc.length);

  const pagamentosPorFuncionario = new Map<string, PagamentoResolvido[]>();
  for (const p of pagamentos) {
    if (!p.funcionarioResolvidoId) continue;
    const arr = pagamentosPorFuncionario.get(p.funcionarioResolvidoId) || [];
    arr.push(p);
    pagamentosPorFuncionario.set(p.funcionarioResolvidoId, arr);
  }
  const documentosPorFuncionario = new Map<string, DocumentoResolvido[]>();
  for (const d of documentos) {
    if (!d.funcionarioResolvidoId) continue;
    const arr = documentosPorFuncionario.get(d.funcionarioResolvidoId) || [];
    arr.push(d);
    documentosPorFuncionario.set(d.funcionarioResolvidoId, arr);
  }

  const funcionariosOrdenados = [...funcionarios].sort((a, b) => a.nome.localeCompare(b.nome));

  linha = 5;
  for (const f of funcionariosOrdenados) {
    const id = employeeId(f);
    const pags = pagamentosPorFuncionario.get(id) || [];
    const docs = documentosPorFuncionario.get(id) || [];
    const alertas = pags.filter((p) => p.situacao === "Cancelado" || p.situacao === "Rejeitado").length;

    const row = wsFunc.getRow(linha);
    row.getCell(1).value = f.nome;
    row.getCell(2).value = f.cpfFormatado;
    row.getCell(3).value = f.status || "";
    row.getCell(4).value = f.funcao || "";
    row.getCell(5).value = f.vinculo || "";
    row.getCell(6).value = f.municipioPolo || "";
    row.getCell(7).value = f.admissao ? isoDateToBr(f.admissao) : "";
    row.getCell(8).value = f.optanteVT === null || f.optanteVT === undefined ? "—" : f.optanteVT ? "Sim" : "Não";
    row.getCell(9).value = f.banco || "";
    row.getCell(10).value = f.agencia || "";
    row.getCell(11).value = f.conta || "";
    row.getCell(12).value = f.telefone || "";
    row.getCell(13).value = docs.length;
    row.getCell(14).value = pags.length;
    row.getCell(15).value = alertas;

    if (alertas > 0) {
      row.getCell(15).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_PROBLEMA_BG } };
      row.getCell(15).font = { color: { argb: COR_PROBLEMA_TXT }, bold: true };
      row.getCell(15).alignment = { horizontal: "center" };
    }
    if (f.status && f.status !== "ATIVO") {
      row.getCell(3).font = { color: { argb: "FF8A8A93" }, italic: true };
    }

    linha++;
  }
  const ultimaLinhaFunc = linha - 1;
  zebrarLinhas(wsFunc, 5, ultimaLinhaFunc, colunasFunc.length);
  wsFunc.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: colunasFunc.length } };

  // ---------- Aba 3: Resumo ----------
  const wsResumo = wb.addWorksheet("Resumo");
  wsResumo.getColumn(1).width = 34;
  wsResumo.getColumn(2).width = 16;
  adicionarFaixaDeTitulo(wsResumo, "Comprovantes TRE — Resumo", `Gerado em ${dataGeracao}`, 2);

  const totalAlertas = pagamentos.filter((p) => p.situacao === "Cancelado" || p.situacao === "Rejeitado").length;
  const ativos = funcionarios.filter((f) => f.status === "ATIVO").length;
  const resumoLinhas: [string, string | number][] = [
    ["Total de funcionários", funcionarios.length],
    ["Funcionários ativos", ativos],
    ["Total de comprovantes em PDF", documentos.length],
    ["Total de registros de pagamento", pagamentos.length],
    ["Pagamentos cancelados/rejeitados (alertas)", totalAlertas],
  ];
  let l = 4;
  for (const [label, valor] of resumoLinhas) {
    wsResumo.getCell(l, 1).value = label;
    wsResumo.getCell(l, 1).font = { bold: true };
    wsResumo.getCell(l, 2).value = valor;
    if (typeof valor === "number") wsResumo.getCell(l, 2).alignment = { horizontal: "right" };
    l++;
  }

  const buffer = await wb.xlsx.writeBuffer();
  return buffer;
}
