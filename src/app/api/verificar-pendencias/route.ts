import { NextRequest, NextResponse } from "next/server";
import { getFuncionarios, getPagamentos } from "@/lib/data";
import { parsePlanilhaPendencia } from "@/lib/pendenciaExtract";
import { verificarPendencias, type PagamentoReal } from "@/lib/verificarPendencias";
import { gerarRelatorioPendencias } from "@/lib/exportPendencias";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const arquivoPlanilha = form.get("planilha");

  if (!(arquivoPlanilha instanceof File)) {
    return NextResponse.json({ erro: "Envie a planilha de pendência (.xlsx)." }, { status: 400 });
  }

  // A base de pagamentos já vem embutida na ferramenta (relatórios "Pagamentos
  // Realizados" do banco + comprovantes individuais já processados) — não é
  // mais necessário anexar um PDF a cada verificação. Pagamentos com situação
  // Cancelado/Rejeitado não contam como "já pago" na comparação.
  const pagamentosBase = await getPagamentos();
  const pagamentosReais: PagamentoReal[] = pagamentosBase
    .filter((p) => p.situacao !== "Cancelado" && p.situacao !== "Rejeitado")
    .map((p) => ({ nome: p.nome, nomeNorm: p.nomeNorm, cpf: p.cpf, tipo: p.tipo, valor: p.valor, data: p.data }));

  if (pagamentosReais.length === 0) {
    return NextResponse.json(
      { erro: "A base de pagamentos da ferramenta está vazia — isso não deveria acontecer. Avise o suporte." },
      { status: 500 }
    );
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
