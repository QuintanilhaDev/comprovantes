import { readJsonLocal, readMutableJson, writeMutableJson } from "./storage";
import type { Documento, Funcionario, Pagamento } from "./types";
import { normalizeCpf, normalizeName } from "./normalize";
import { buildFuncionarioIndexes, matchFuncionario } from "./match";
import { employeeId } from "./employeeId";
import { construirMapaValorTipo, sugerirTipoPorValor } from "./valorHeuristica";

export type PagamentoResolvido = Pagamento & { funcionarioResolvidoId: string | null };
export type DocumentoResolvido = Documento & { funcionarioResolvidoId: string | null };

interface Cache {
  funcionarios: Funcionario[] | null;
  pagamentosResolvidos: PagamentoResolvido[] | null;
  documentosResolvidos: DocumentoResolvido[] | null;
  loadedAt: number;
}

const cache: Cache = { funcionarios: null, pagamentosResolvidos: null, documentosResolvidos: null, loadedAt: 0 };
const CACHE_TTL_MS = 10 * 60_000; // cache generoso: invalidamos explicitamente após uploads

function isFresh() {
  return Date.now() - cache.loadedAt < CACHE_TTL_MS;
}

export function invalidateCache() {
  cache.funcionarios = null;
  cache.pagamentosResolvidos = null;
  cache.documentosResolvidos = null;
  cache.loadedAt = 0;
}

export async function getFuncionarios(): Promise<Funcionario[]> {
  if (cache.funcionarios && isFresh()) return cache.funcionarios;

  const baseline = await readJsonLocal<Funcionario[]>("employees.json", []);
  const override = await readMutableJson<Funcionario[] | null>("employees_override", null);

  const list = override && override.length > 0 ? override : baseline;

  // garante nomeNorm/cpf normalizados mesmo se vierem de upload manual
  const normalized = list.map((f) => ({
    ...f,
    cpf: normalizeCpf(f.cpf),
    nomeNorm: f.nomeNorm || normalizeName(f.nome),
  }));

  cache.funcionarios = normalized;
  return normalized;
}

/**
 * Carrega pagamentos e documentos e resolve, para cada um, a qual funcionário
 * pertence — tolerando nomes abreviados/truncados por bancos e pequenas
 * diferenças de grafia. Também aplica reclassificações automáticas (quando um
 * relatório enviado posteriormente permite identificar o tipo de um
 * comprovante que antes estava "não identificado").
 */
let resolucaoEmAndamento: Promise<void> | null = null;

async function carregarResolvidos(): Promise<void> {
  if (cache.pagamentosResolvidos && cache.documentosResolvidos && isFresh()) return;
  if (resolucaoEmAndamento) return resolucaoEmAndamento;

  resolucaoEmAndamento = (async () => {
    const funcionarios = await getFuncionarios();
    const { cpfIndex, nomeIndex, porPrimeiraPalavra } = buildFuncionarioIndexes(funcionarios);

    const pagBaseline = await readJsonLocal<Pagamento[]>("pagamentos.json", []);
    const pagExtra = await readMutableJson<Pagamento[]>("pagamentos_extra", []);
    const pagamentosBrutos = [...pagBaseline, ...pagExtra];

    // Alguns pagamentos (principalmente comprovantes de Pix antigos) não tinham
    // como informar o tipo diretamente no texto. Preenche esses casos usando o
    // histórico de valores já confiáveis (ex: R$66,00 é quase sempre Auxílio) —
    // só quando há uma amostra boa e um tipo claramente dominante.
    const mapaValorTipo = construirMapaValorTipo(pagamentosBrutos);
    const pagamentos = pagamentosBrutos.map((p) => {
      if (p.tipo !== "NAO_IDENTIFICADO") return p;
      const sugestao = sugerirTipoPorValor(p.valor, mapaValorTipo);
      return sugestao ? { ...p, tipo: sugestao } : p;
    });

    const docBaseline = await readJsonLocal<Documento[]>("documentos.json", []);
    const docExtra = await readMutableJson<Documento[]>("documentos_extra", []);
    const reclassificacoes = await readMutableJson<Record<string, Partial<Documento>>>(
      "documentos_reclassificacoes",
      {}
    );
    const documentosBrutos = [...docBaseline, ...docExtra].map((d) => {
      const ajuste = reclassificacoes[d.id];
      return ajuste ? { ...d, ...ajuste } : d;
    });

    const documentosResolvidos: DocumentoResolvido[] = documentosBrutos.map((d) => {
      const f = matchFuncionario(d.nomeNorm, d.cpf, funcionarios, cpfIndex, nomeIndex, porPrimeiraPalavra);
      return { ...d, funcionarioResolvidoId: f ? employeeId(f) : null };
    });

    const pagamentosResolvidosBrutos: PagamentoResolvido[] = pagamentos.map((p) => {
      const f = matchFuncionario(p.nomeNorm, p.cpf, funcionarios, cpfIndex, nomeIndex, porPrimeiraPalavra);
      return { ...p, funcionarioResolvidoId: f ? employeeId(f) : null };
    });

    // Alguns comprovantes individuais (ex: um PDF avulso anexado manualmente) não
    // têm nenhum relatório em lote cobrindo aquele dia — sem isso, o funcionário
    // sumiria do "Histórico no relatório do banco" e da planilha exportada mesmo
    // tendo comprovante. Preenche com uma entrada "sintética" a partir do próprio
    // comprovante, só quando aquele pagamento ainda não está representado.
    const cobertos = new Set(
      pagamentosResolvidosBrutos
        .filter((p) => p.data && p.valor !== null)
        .map((p) => `${p.funcionarioResolvidoId || p.nomeNorm}|${p.data}|${p.valor}`)
    );
    const pagamentosDeDocumentos: PagamentoResolvido[] = [];
    for (const d of documentosResolvidos) {
      if (!d.data || d.valor === null) continue;
      const chave = `${d.funcionarioResolvidoId || d.nomeNorm}|${d.data}|${d.valor}`;
      if (cobertos.has(chave)) continue; // já existe um pagamento real (com tipo mais confiável) para isso
      cobertos.add(chave);
      pagamentosDeDocumentos.push({
        nome: d.nome,
        nomeNorm: d.nomeNorm,
        cpf: d.cpf,
        tipo: d.tipo,
        periodo: null,
        data: d.data,
        valor: d.valor,
        situacao: d.situacao,
        fonteArquivo: d.arquivoRelativo,
        origem: "upload_manual",
        funcionarioResolvidoId: d.funcionarioResolvidoId,
      });
    }

    const pagamentosResolvidos: PagamentoResolvido[] = deduplicarPagamentos([
      ...pagamentosResolvidosBrutos,
      ...pagamentosDeDocumentos,
    ]);

    cache.pagamentosResolvidos = pagamentosResolvidos;
    cache.documentosResolvidos = documentosResolvidos;
    cache.loadedAt = Date.now();
  })();

  try {
    await resolucaoEmAndamento;
  } finally {
    resolucaoEmAndamento = null;
  }
}

export async function getPagamentos(): Promise<PagamentoResolvido[]> {
  await carregarResolvidos();
  return cache.pagamentosResolvidos!;
}

export async function getDocumentos(): Promise<DocumentoResolvido[]> {
  await carregarResolvidos();
  return cache.documentosResolvidos!;
}

/** Retorna todos os pagamentos/documentos vinculados a um funcionário (por id resolvido, CPF ou nome). */
export async function getExtratoFuncionario(funcionario: Funcionario | null, id: string) {
  const [pagamentos, documentos] = await Promise.all([getPagamentos(), getDocumentos()]);
  const cpf = funcionario?.cpf || null;
  const nomeNorm = funcionario?.nomeNorm || null;

  const pertence = (item: { funcionarioResolvidoId: string | null; cpf: string | null; nomeNorm: string }) =>
    item.funcionarioResolvidoId === id || (!!cpf && item.cpf === cpf) || (!!nomeNorm && item.nomeNorm === nomeNorm);

  return {
    pagamentos: pagamentos.filter(pertence).sort((a, b) => (b.data || "").localeCompare(a.data || "")),
    documentos: documentos.filter(pertence).sort((a, b) => (b.data || "").localeCompare(a.data || "")),
  };
}

export async function addDocumentos(novos: Documento[]) {
  const extra = await readMutableJson<Documento[]>("documentos_extra", []);
  const merged = [...extra, ...novos];
  await writeMutableJson("documentos_extra", merged);
  invalidateCache();
}

export async function addPagamentos(novos: Pagamento[]) {
  const extra = await readMutableJson<Pagamento[]>("pagamentos_extra", []);
  const merged = [...extra, ...novos];
  await writeMutableJson("pagamentos_extra", merged);
  invalidateCache();
}

export async function mesclarNovaPlanilha(novos: Funcionario[]) {
  const atuais = await getFuncionarios();
  const { mesclarFuncionarios } = await import("./mergeFuncionarios");
  const resultado = mesclarFuncionarios(atuais, novos);
  await writeMutableJson("employees_override", resultado.resultado);
  invalidateCache();
  return resultado;
}

/** Permite que o usuário classifique manualmente um comprovante que não pôde ser identificado automaticamente. */
export async function classificarDocumentoManualmente(
  documentoId: string,
  tipo: Documento["tipo"]
): Promise<void> {
  const atuais = await readMutableJson<Record<string, Partial<Documento>>>("documentos_reclassificacoes", {});
  atuais[documentoId] = { ...atuais[documentoId], tipo, fonteClassificacao: "manual_usuario" };
  await writeMutableJson("documentos_reclassificacoes", atuais);
  invalidateCache();
}

/**
 * Depois de adicionar novos pagamentos (ex: um relatório de lote enviado), tenta
 * reclassificar automaticamente comprovantes antigos que ficaram como "não
 * identificado" — cruzando por funcionário resolvido + valor (mesma lógica usada
 * na montagem inicial da base). Retorna quantos comprovantes foram atualizados.
 */
export async function reclassificarNaoIdentificados(): Promise<number> {
  invalidateCache();
  const [pagamentos, documentos] = await Promise.all([getPagamentos(), getDocumentos()]);

  const pagamentosPorFuncionario = new Map<string, PagamentoResolvido[]>();
  for (const p of pagamentos) {
    if (!p.funcionarioResolvidoId) continue;
    const arr = pagamentosPorFuncionario.get(p.funcionarioResolvidoId) || [];
    arr.push(p);
    pagamentosPorFuncionario.set(p.funcionarioResolvidoId, arr);
  }

  const reclassificacoesAtuais = await readMutableJson<Record<string, Partial<Documento>>>(
    "documentos_reclassificacoes",
    {}
  );
  let atualizados = 0;

  for (const d of documentos) {
    if (d.tipo !== "NAO_IDENTIFICADO" || !d.funcionarioResolvidoId) continue;
    const candidatos = pagamentosPorFuncionario.get(d.funcionarioResolvidoId) || [];
    if (candidatos.length === 0 || d.valor === null) continue;

    // Só reclassifica automaticamente quando há uma correspondência EXATA de valor —
    // sem isso, arriscaríamos rotular um comprovante com o tipo errado (ex: marcar um
    // Vale Transporte como Salário só porque é o pagamento mais próximo na data).
    const comValorIgual = candidatos.filter((c) => c.valor !== null && Math.abs(c.valor - d.valor!) < 0.01);
    if (comValorIgual.length === 0) continue;

    const melhor = comValorIgual
      .slice()
      .sort((a, b) => distanciaDatas(a.data, d.data) - distanciaDatas(b.data, d.data))[0];

    if (melhor && melhor.tipo !== "NAO_IDENTIFICADO") {
      reclassificacoesAtuais[d.id] = {
        tipo: melhor.tipo,
        situacao: melhor.situacao,
        fonteClassificacao: "relatorio_lote",
      };
      atualizados++;
    }
  }

  if (atualizados > 0) {
    await writeMutableJson("documentos_reclassificacoes", reclassificacoesAtuais);
    invalidateCache();
  }

  return atualizados;
}

function distanciaDatas(a: string | null, b: string | null): number {
  if (!a || !b) return 9999;
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (Number.isNaN(da) || Number.isNaN(db)) return 9999;
  return Math.abs(da - db) / (1000 * 60 * 60 * 24);
}

/**
 * Remove pagamentos duplicados — comum quando dois relatórios do banco enviados
 * em momentos diferentes (ex: o relatório original de um período e depois um
 * relatório de "Pendência" do mesmo período) acabam listando a MESMA transação.
 *
 * Duas passadas:
 * 1. Remove duplicatas EXATAS: mesmo funcionário, tipo, valor e data.
 * 2. Quando existe uma versão COM data e outra idêntica (mesmo funcionário,
 *    tipo e valor) SEM data, remove a versão sem data — ela quase sempre é o
 *    mesmo pagamento relatado por uma fonte menos completa, não um pagamento
 *    a mais.
 */
function deduplicarPagamentos(pagamentos: PagamentoResolvido[]): PagamentoResolvido[] {
  const chaveExata = (p: PagamentoResolvido) =>
    `${p.funcionarioResolvidoId || p.nomeNorm}|${p.tipo}|${p.valor}|${p.data || ""}`;

  const semExatas: PagamentoResolvido[] = [];
  const vistos = new Set<string>();
  for (const p of pagamentos) {
    const k = chaveExata(p);
    if (vistos.has(k)) continue;
    vistos.add(k);
    semExatas.push(p);
  }

  const chaveSemData = (p: PagamentoResolvido) => `${p.funcionarioResolvidoId || p.nomeNorm}|${p.tipo}|${p.valor}`;
  const temVersaoComData = new Set(semExatas.filter((p) => p.data).map(chaveSemData));

  return semExatas.filter((p) => p.data || !temVersaoComData.has(chaveSemData(p)));
}
