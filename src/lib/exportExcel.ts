import ExcelJS from "exceljs";
import type { Funcionario } from "./types";
import type { DocumentoResolvido, PagamentoResolvido } from "./data";
import { formatBRL, formatCpf, isoDateToBr } from "./normalize";
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

// Chave especial para agrupar pagamentos que não têm data (não entram numa coluna de data).
const SEM_DATA_KEY = "__SEM_DATA__";

type Alinhamento = "left" | "center" | "right";

/** Especificação de uma coluna: cabeçalho, largura mínima/máxima para o auto-fit e alinhamento fixo. */
interface ColunaSpec {
  header: string;
  min: number;
  max: number;
  align: Alinhamento;
  /** Se true, força formato de texto (evita que apps tipo Google Sheets interpretem CPF/telefone/conta como número). */
  textoForcado?: boolean;
}

function estilizarCabecalho(ws: ExcelJS.Worksheet, linha: number, ultimaColuna: number) {
  const row = ws.getRow(linha);
  row.height = 22;
  for (let c = 1; c <= ultimaColuna; c++) {
    const cell = row.getCell(c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_MARCA } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
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
      const cell = ws.getCell(l, c);
      const bordaAtual = cell.border || {};
      cell.border = { ...bordaAtual, bottom: { style: "hair", color: { argb: COR_BORDA } } };
    }
  }
}

function corSituacao(situacao: string): { bg: string; txt: string } {
  if (situacao === "Pago") return { bg: COR_PAGO_BG, txt: COR_PAGO_TXT };
  if (situacao === "Cancelado" || situacao === "Rejeitado") return { bg: COR_PROBLEMA_BG, txt: COR_PROBLEMA_TXT };
  return { bg: COR_PENDENTE_BG, txt: COR_PENDENTE_TXT };
}

/**
 * Aplica, numa faixa de linhas já preenchidas, o alinhamento definido em cada
 * ColunaSpec (sem sobrescrever wrapText/vertical de células que já tiverem
 * alinhamento próprio, como as células de pagamento com múltiplas linhas) e
 * ajusta a largura de cada coluna ao maior conteúdo real (cabeçalho incluído),
 * respeitando os limites min/max — isso evita tanto texto cortado quanto
 * colunas artificialmente largas.
 */
function finalizarColunas(
  ws: ExcelJS.Worksheet,
  specs: ColunaSpec[],
  primeiraLinhaCabecalho: number,
  primeiraLinhaDados: number,
  ultimaLinhaDados: number
) {
  specs.forEach((spec, idx) => {
    const col = idx + 1;
    let maiorLinha = spec.header.length;

    for (let l = primeiraLinhaDados; l <= ultimaLinhaDados; l++) {
      const cell = ws.getCell(l, col);
      if (spec.textoForcado) cell.numFmt = "@";
      const alignmentAtual = cell.alignment;
      cell.alignment = {
        ...alignmentAtual,
        vertical: "middle",
        horizontal: spec.align,
      };

      const texto = cell.value == null ? "" : String(cell.value);
      for (const linha of texto.split("\n")) {
        maiorLinha = Math.max(maiorLinha, linha.length);
      }
    }

    ws.getColumn(col).width = Math.min(Math.max(maiorLinha + 2, spec.min), spec.max);
    void primeiraLinhaCabecalho;
  });
}

/**
 * Alguns relatórios de banco trazem avisos de "Retorno Bancário" / notificações de
 * pendência que não são pagamentos de fato — não têm funcionário identificado, não
 * têm valor e caem no tipo "Não identificado". Isso polui a planilha (aparecem como
 * se fossem uma pessoa chamada, por exemplo, "2026-09-10 - Max Serviços - BB -
 * Retorno Bancário..."). Filtramos esses registros antes de montar a exportação.
 */
function isPagamentoValido(p: PagamentoResolvido): boolean {
  const semFuncionario = !p.funcionarioResolvidoId;
  const semValor = p.valor === null || p.valor === 0;
  const naoIdentificado = p.tipo === "NAO_IDENTIFICADO";
  if (semFuncionario && semValor && naoIdentificado) return false;
  return true;
}

interface GrupoFuncionario {
  chave: string;
  nome: string;
  cpf: string;
  funcao: string;
  municipio: string;
  porData: Map<string, PagamentoResolvido[]>;
}

export async function gerarPlanilhaGeral(
  funcionarios: Funcionario[],
  pagamentosBrutos: PagamentoResolvido[],
  documentos: DocumentoResolvido[]
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Comprovantes TRE";
  wb.created = new Date();

  const agora = new Date();
  // O servidor (Vercel/Node) roda em UTC — sem especificar o fuso, o horário exibido
  // ficava 3h à frente do horário real de Salvador. "America/Bahia" cobre Salvador e
  // não tem horário de verão, então o offset é sempre -03:00.
  const dataGeracao = agora.toLocaleString("pt-BR", { timeZone: "America/Bahia" });

  const funcionarioPorId = new Map(funcionarios.map((f) => [employeeId(f), f]));
  const pagamentos = pagamentosBrutos.filter(isPagamentoValido);

  // ---------- Aba 1: Pagamentos (uma linha por funcionário, uma coluna por data) ----------
  const wsPag = wb.addWorksheet("Pagamentos");

  // Agrupa os pagamentos por funcionário (ou, na falta de um match, pelo nome normalizado
  // que veio no comprovante) e, dentro de cada um, por data.
  const grupos = new Map<string, GrupoFuncionario>();
  let temSemData = false;
  const todasDatas = new Set<string>();

  for (const p of pagamentos) {
    const f = p.funcionarioResolvidoId ? funcionarioPorId.get(p.funcionarioResolvidoId) : undefined;
    const chave = p.funcionarioResolvidoId || `nome:${p.nomeNorm}`;

    let grupo = grupos.get(chave);
    if (!grupo) {
      grupo = {
        chave,
        nome: f?.nome || p.nome,
        cpf: f?.cpfFormatado || (p.cpf ? formatCpf(p.cpf) : ""),
        funcao: f?.funcao || "",
        municipio: f?.municipioPolo || "",
        porData: new Map(),
      };
      grupos.set(chave, grupo);
    }

    const chaveData = p.data || SEM_DATA_KEY;
    if (chaveData === SEM_DATA_KEY) temSemData = true;
    else todasDatas.add(chaveData);

    const lista = grupo.porData.get(chaveData) || [];
    lista.push(p);
    grupo.porData.set(chaveData, lista);
  }

  const datasOrdenadas = [...todasDatas].sort();

  const specsFixas: ColunaSpec[] = [
    { header: "Funcionário", min: 24, max: 40, align: "left" },
    { header: "CPF", min: 14, max: 16, align: "center", textoForcado: true },
    { header: "Função", min: 20, max: 42, align: "left" },
    { header: "Município (Polo)", min: 16, max: 26, align: "left" },
  ];
  const specsData: (ColunaSpec & { chaveData: string })[] = datasOrdenadas.map((d) => ({
    header: isoDateToBr(d),
    min: 12,
    max: 30,
    align: "left" as const,
    chaveData: d,
  }));
  if (temSemData) {
    specsData.push({ header: "Sem data", min: 12, max: 30, align: "left", chaveData: SEM_DATA_KEY });
  }
  const specTotal: ColunaSpec = { header: "Total Pago", min: 13, max: 18, align: "right" };

  const specsPag: ColunaSpec[] = [...specsFixas, ...specsData, specTotal];
  const totalColunas = specsPag.length;

  adicionarFaixaDeTitulo(wsPag, "Comprovantes TRE — Pagamentos por Funcionário", `Gerado em ${dataGeracao}`, totalColunas);

  wsPag.getRow(4).values = specsPag.map((c) => c.header);
  wsPag.views = [{ state: "frozen", xSplit: specsFixas.length, ySplit: 4 }];
  estilizarCabecalho(wsPag, 4, totalColunas);

  const gruposOrdenados = [...grupos.values()].sort((a, b) => a.nome.localeCompare(b.nome));

  let linha = 5;
  for (const g of gruposOrdenados) {
    const row = wsPag.getRow(linha);
    row.getCell(1).value = g.nome;
    row.getCell(2).value = g.cpf;
    row.getCell(3).value = g.funcao;
    row.getCell(4).value = g.municipio;

    let totalPago = 0;
    let maxLinhasNaLinha = 1;

    specsData.forEach((spec, idx) => {
      const col = specsFixas.length + idx + 1;
      const cell = row.getCell(col);
      const itens = g.porData.get(spec.chaveData) || [];
      if (itens.length === 0) return;

      maxLinhasNaLinha = Math.max(maxLinhasNaLinha, itens.length);

      cell.value = itens.map((p) => `${TIPO_LABEL[p.tipo] || p.tipo}: ${formatBRL(p.valor)}`).join("\n");
      cell.alignment = { wrapText: true, vertical: "middle", horizontal: "left" };

      const temProblema = itens.some((p) => p.situacao === "Cancelado" || p.situacao === "Rejeitado");
      const temPendente = itens.some((p) => p.situacao === "Pendente");
      const situacaoDominante = temProblema ? "Cancelado" : temPendente ? "Pendente" : "Pago";
      const { bg, txt } = corSituacao(situacaoDominante);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      cell.font = { color: { argb: txt } };

      for (const p of itens) {
        if (p.situacao === "Pago" && p.valor) totalPago += p.valor;
      }
    });

    const colTotal = specsFixas.length + specsData.length + 1;
    row.getCell(colTotal).value = totalPago;
    row.getCell(colTotal).numFmt = '"R$" #,##0.00';
    row.getCell(colTotal).font = { bold: true };

    row.height = Math.max(20, 14 + maxLinhasNaLinha * 13);
    linha++;
  }

  const ultimaLinhaPag = linha - 1;
  // Para as colunas de data (multi-linha), preservamos o alinhamento que já foi
  // aplicado célula a célula acima — por isso elas entram como "left" no spec,
  // igual ao que já está lá, e o finalizarColunas só recalcula a largura.
  finalizarColunas(wsPag, specsPag, 4, 5, ultimaLinhaPag);
  zebrarLinhas(wsPag, 5, ultimaLinhaPag, totalColunas);
  wsPag.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: totalColunas } };

  // ---------- Aba 2: Funcionários (um por linha, dados de cadastro) ----------
  const wsFunc = wb.addWorksheet("Funcionários", { views: [{ state: "frozen", ySplit: 4 }] });
  const specsFunc: ColunaSpec[] = [
    { header: "Nome", min: 24, max: 40, align: "left" },
    { header: "CPF", min: 14, max: 16, align: "center", textoForcado: true },
    { header: "Status", min: 10, max: 14, align: "center" },
    { header: "Função", min: 20, max: 42, align: "left" },
    { header: "Vínculo", min: 10, max: 14, align: "center" },
    { header: "Município (Polo)", min: 16, max: 26, align: "left" },
    { header: "Admissão", min: 11, max: 13, align: "center" },
    { header: "Optante VT", min: 11, max: 13, align: "center" },
    { header: "Banco", min: 8, max: 10, align: "center", textoForcado: true },
    { header: "Agência", min: 9, max: 12, align: "center", textoForcado: true },
    { header: "Conta", min: 10, max: 14, align: "center", textoForcado: true },
    { header: "Telefone", min: 13, max: 17, align: "center", textoForcado: true },
    { header: "Total Comprovantes", min: 12, max: 20, align: "center" },
    { header: "Total Pagamentos", min: 12, max: 18, align: "center" },
    { header: "Alertas", min: 9, max: 10, align: "center" },
  ];
  adicionarFaixaDeTitulo(wsFunc, "Comprovantes TRE — Funcionários", `Gerado em ${dataGeracao}`, specsFunc.length);
  wsFunc.getRow(4).values = specsFunc.map((c) => c.header);
  estilizarCabecalho(wsFunc, 4, specsFunc.length);

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
    }
    if (f.status && f.status !== "ATIVO") {
      row.getCell(3).font = { color: { argb: "FF8A8A93" }, italic: true };
    }

    linha++;
  }
  const ultimaLinhaFunc = linha - 1;
  finalizarColunas(wsFunc, specsFunc, 4, 5, ultimaLinhaFunc);
  zebrarLinhas(wsFunc, 5, ultimaLinhaFunc, specsFunc.length);
  wsFunc.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: specsFunc.length } };

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