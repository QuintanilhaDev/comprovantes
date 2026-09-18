import { NextRequest, NextResponse } from "next/server";
import { getFuncionarios, getPagamentos } from "@/lib/data";
import {
  pareceLotePix,
  pareceRelatorioDeLote,
  pareceRelatorioPagamentosRealizados,
  parseLotePix,
  parseRelatorioDeLote,
  parseRelatorioPagamentosRealizados,
} from "@/lib/batchExtract";
import { construirMapaValorTipo, sugerirTipoPorValor } from "@/lib/valorHeuristica";
import { parsePlanilhaPendencia } from "@/lib/pendenciaExtract";
import { verificarPendencias, type PagamentoReal } from "@/lib/verificarPendencias";
import { gerarRelatorioPendencias } from "@/lib/exportPendencias";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PDF_BYTES = 4 * 1024 * 1024;

function linhaLoteParaPagamentoReal(l: { nome: string; nomeNorm: string; cpf: string | null; tipo: PagamentoReal["tipo"]; valor: number | null; data: string | null }): PagamentoReal {
  return { nome: l.nome, nomeNorm: l.nomeNorm, cpf: l.cpf, tipo: l.tipo, valor: l.valor, data: l.data };
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const arquivoPlanilha = form.get("planilha");
  const arquivosPdf = form.getAll("relatorios").filter((f): f is File => f instanceof File);

  if (!(arquivoPlanilha instanceof File)) {
    return NextResponse.json({ erro: "Envie a planilha de pendência (.xlsx)." }, { status: 400 });
  }
  if (arquivosPdf.length === 0) {
    return NextResponse.json({ erro: "Envie ao menos um relatório de pagamentos realizados (PDF)." }, { status: 400 });
  }

  const arquivosGrandesDemais = arquivosPdf.filter((f) => f.size > MAX_PDF_BYTES);
  if (arquivosGrandesDemais.length > 0) {
    return NextResponse.json(
      {
        erro: `${arquivosGrandesDemais.map((f) => f.name).join(", ")} ${arquivosGrandesDemais.length > 1 ? "estão" : "está"} acima de ${(MAX_PDF_BYTES / (1024 * 1024)).toFixed(1)}MB. Exporte o relatório do banco em períodos menores (ex: por quinzena) e envie em partes.`,
      },
      { status: 413 }
    );
  }

  const pagamentosReais: PagamentoReal[] = [];
  const avisosArquivos: string[] = [];

  for (const file of arquivosPdf) {
    const bytes = Buffer.from(await file.arrayBuffer());
    let texto = "";
    try {
      const pdfParse = (await import("pdf-parse")).default;
      const resultado = await pdfParse(bytes);
      texto = resultado.text || "";
    } catch {
      texto = "";
    }
    if (!texto.trim()) {
      avisosArquivos.push(`${file.name}: não foi possível extrair texto deste PDF.`);
      continue;
    }

    let encontrouFormato = false;
    if (pareceRelatorioPagamentosRealizados(texto)) {
      const { linhas } = parseRelatorioPagamentosRealizados(texto, file.name);
      pagamentosReais.push(...linhas.map(linhaLoteParaPagamentoReal));
      encontrouFormato = true;
    } else if (pareceRelatorioDeLote(texto)) {
      const { linhas } = parseRelatorioDeLote(texto, file.name);
      pagamentosReais.push(...linhas.map(linhaLoteParaPagamentoReal));
      encontrouFormato = true;
    } else if (pareceLotePix(texto)) {
      const linhas = parseLotePix(texto, file.name);
      pagamentosReais.push(...linhas.map(linhaLoteParaPagamentoReal));
      encontrouFormato = true;
    }

    if (!encontrouFormato) {
      avisosArquivos.push(`${file.name}: formato não reconhecido — ignorado.`);
    }
  }

  if (pagamentosReais.length === 0) {
    return NextResponse.json(
      { erro: "Nenhum pagamento foi lido dos relatórios enviados.", avisos: avisosArquivos },
      { status: 400 }
    );
  }

  // Os relatórios "Pagamentos Realizados" costumam não dizer se cada linha é VT
  // ou Auxílio — usa o histórico já conhecido da ferramenta (onde a maioria dos
  // valores já está associada a um tipo) para preencher isso antes de comparar.
  const pagamentosConhecidos = await getPagamentos();
  const mapaValorTipo = construirMapaValorTipo([...pagamentosConhecidos, ...pagamentosReais]);
  for (const p of pagamentosReais) {
    if (p.tipo === "NAO_IDENTIFICADO") {
      const sugestao = sugerirTipoPorValor(p.valor, mapaValorTipo);
      if (sugestao) p.tipo = sugestao;
    }
  }

  const planilhaBytes = Buffer.from(await arquivoPlanilha.arrayBuffer());
  const { linhas: linhasPendencia, avisos: avisosPlanilha } = parsePlanilhaPendencia(planilhaBytes);

  if (linhasPendencia.length === 0) {
    return NextResponse.json(
      { erro: "Nenhuma linha foi reconhecida na planilha de pendência.", avisos: avisosPlanilha },
      { status: 400 }
    );
  }

  const funcionarios = await getFuncionarios();
  const resultados = verificarPendencias(linhasPendencia, pagamentosReais, funcionarios);

  const buffer = await gerarRelatorioPendencias(resultados);

  const contagem = { PENDENTE_CONFIRMADA: 0, JA_PAGO: 0, VALOR_DIVERGENTE: 0, NAO_ENCONTRADO: 0 };
  for (const r of resultados) contagem[r.status]++;

  const dataArquivo = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="verificacao-pendencias-${dataArquivo}.xlsx"`,
      "Cache-Control": "no-store",
      "X-Total-Linhas": String(resultados.length),
      "X-Pendente-Confirmada": String(contagem.PENDENTE_CONFIRMADA),
      "X-Ja-Pago": String(contagem.JA_PAGO),
      "X-Valor-Divergente": String(contagem.VALOR_DIVERGENTE),
      "X-Nao-Encontrado": String(contagem.NAO_ENCONTRADO),
    },
  });
}
