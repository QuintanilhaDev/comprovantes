import type { Funcionario, TipoBeneficio } from "./types";
import { buildFuncionarioIndexes, matchFuncionario } from "./match";
import { employeeId } from "./employeeId";
import type { LinhaPendencia } from "./pendenciaExtract";

export interface PagamentoReal {
  nome: string;
  nomeNorm: string;
  cpf: string | null;
  tipo: TipoBeneficio;
  valor: number | null;
  data: string | null;
}

export type StatusPendencia = "PENDENTE_CONFIRMADA" | "JA_PAGO" | "VALOR_DIVERGENTE" | "NAO_ENCONTRADO";

export interface ResultadoPendencia {
  linhaOriginal: number;
  nome: string;
  cpf: string | null;
  funcionarioEncontrado: boolean;
  tipoConsiderado: TipoBeneficio | null;
  valorNaPlanilha: number | null;
  valorEncontrado: number | null;
  dataEncontrada: string | null;
  status: StatusPendencia;
  observacao: string;
}

const TOLERANCIA_VALOR = 0.01;

function construirMapaValorTipo(pagamentos: PagamentoReal[]): Map<number, TipoBeneficio> {
  const contagem = new Map<number, Map<TipoBeneficio, number>>();
  for (const p of pagamentos) {
    if (p.valor === null || p.tipo === "NAO_IDENTIFICADO") continue;
    const valor = Math.round(p.valor * 100) / 100;
    if (!contagem.has(valor)) contagem.set(valor, new Map());
    const porTipo = contagem.get(valor)!;
    porTipo.set(p.tipo, (porTipo.get(p.tipo) || 0) + 1);
  }
  const mapa = new Map<number, TipoBeneficio>();
  for (const [valor, porTipo] of contagem) {
    const total = [...porTipo.values()].reduce((a, b) => a + b, 0);
    const [tipoTop, qtdTop] = [...porTipo.entries()].sort((a, b) => b[1] - a[1])[0];
    if (total >= 5 && qtdTop / total >= 0.85) mapa.set(valor, tipoTop);
  }
  return mapa;
}

export function verificarPendencias(
  linhasPendencia: LinhaPendencia[],
  pagamentosReais: PagamentoReal[],
  funcionarios: Funcionario[]
): ResultadoPendencia[] {
  const { cpfIndex, nomeIndex, porPrimeiraPalavra } = buildFuncionarioIndexes(funcionarios);
  const mapaValorTipo = construirMapaValorTipo(pagamentosReais);

  const pagamentosPorPessoa = new Map<string, PagamentoReal[]>();
  for (const p of pagamentosReais) {
    const f = matchFuncionario(p.nomeNorm, p.cpf, funcionarios, cpfIndex, nomeIndex, porPrimeiraPalavra);
    const chave = f ? employeeId(f) : `nome:${p.nomeNorm}`;
    const arr = pagamentosPorPessoa.get(chave) || [];
    arr.push(p);
    pagamentosPorPessoa.set(chave, arr);
  }

  const resultados: ResultadoPendencia[] = [];

  for (const linha of linhasPendencia) {
    const funcionario = matchFuncionario(linha.nomeNorm, linha.cpf, funcionarios, cpfIndex, nomeIndex, porPrimeiraPalavra);
    const chave = funcionario ? employeeId(funcionario) : `nome:${linha.nomeNorm}`;
    const pagamentosDaPessoa = pagamentosPorPessoa.get(chave) || [];

    if (pagamentosDaPessoa.length === 0 && !funcionario) {
      resultados.push({
        linhaOriginal: linha.linhaOriginal,
        nome: linha.nome,
        cpf: linha.cpf,
        funcionarioEncontrado: false,
        tipoConsiderado: linha.tipo,
        valorNaPlanilha: linha.valor,
        valorEncontrado: null,
        dataEncontrada: null,
        status: "NAO_ENCONTRADO",
        observacao: "Não encontramos esta pessoa nem no cadastro de funcionários, nem nos pagamentos realizados.",
      });
      continue;
    }

    const tipoConsiderado =
      linha.tipo || (linha.valor !== null ? mapaValorTipo.get(Math.round(linha.valor * 100) / 100) || null : null);

    const candidatosMesmoTipo = tipoConsiderado
      ? pagamentosDaPessoa.filter((p) => p.tipo === tipoConsiderado)
      : pagamentosDaPessoa;

    if (candidatosMesmoTipo.length === 0) {
      resultados.push({
        linhaOriginal: linha.linhaOriginal,
        nome: funcionario ? funcionario.nome : linha.nome,
        cpf: funcionario ? funcionario.cpf : linha.cpf,
        funcionarioEncontrado: !!funcionario,
        tipoConsiderado,
        valorNaPlanilha: linha.valor,
        valorEncontrado: null,
        dataEncontrada: null,
        status: "PENDENTE_CONFIRMADA",
        observacao: tipoConsiderado
          ? `Nenhum pagamento de ${tipoConsiderado} encontrado nos relatórios enviados — pendência parece real.`
          : "Nenhum pagamento encontrado nos relatórios enviados — pendência parece real.",
      });
      continue;
    }

    const comValorIgual =
      linha.valor !== null
        ? candidatosMesmoTipo.filter((p) => p.valor !== null && Math.abs(p.valor - linha.valor!) < TOLERANCIA_VALOR)
        : [];

    if (comValorIgual.length > 0) {
      const maisRecente = comValorIgual.sort((a, b) => (b.data || "").localeCompare(a.data || ""))[0];
      resultados.push({
        linhaOriginal: linha.linhaOriginal,
        nome: funcionario ? funcionario.nome : linha.nome,
        cpf: funcionario ? funcionario.cpf : linha.cpf,
        funcionarioEncontrado: !!funcionario,
        tipoConsiderado,
        valorNaPlanilha: linha.valor,
        valorEncontrado: maisRecente.valor,
        dataEncontrada: maisRecente.data,
        status: "JA_PAGO",
        observacao: "Já foi pago — pendência não existe mais.",
      });
      continue;
    }

    const maisRecenteDivergente = candidatosMesmoTipo.sort((a, b) => (b.data || "").localeCompare(a.data || ""))[0];
    const valorPlanilhaTxt = linha.valor !== null ? linha.valor.toFixed(2).replace(".", ",") : "?";
    const valorRealTxt = maisRecenteDivergente.valor !== null ? maisRecenteDivergente.valor.toFixed(2).replace(".", ",") : "?";
    resultados.push({
      linhaOriginal: linha.linhaOriginal,
      nome: funcionario ? funcionario.nome : linha.nome,
      cpf: funcionario ? funcionario.cpf : linha.cpf,
      funcionarioEncontrado: !!funcionario,
      tipoConsiderado,
      valorNaPlanilha: linha.valor,
      valorEncontrado: maisRecenteDivergente.valor,
      dataEncontrada: maisRecenteDivergente.data,
      status: "VALOR_DIVERGENTE",
      observacao: `A planilha diz R$ ${valorPlanilhaTxt}, mas o valor efetivamente pago foi R$ ${valorRealTxt}.`,
    });
  }

  return resultados;
}
