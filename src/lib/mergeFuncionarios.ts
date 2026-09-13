import type { Funcionario } from "./types";

/**
 * Mescla a lista de funcionários atual com uma nova lista vinda de uma planilha
 * recém-enviada — em vez de simplesmente substituir tudo (o que faz qualquer
 * problema na nova planilha apagar dados bons que já existiam).
 *
 * Regras:
 * 1. Funcionário identificado pelo CPF. Quem já existe é ATUALIZADO campo a
 *    campo (nunca duplicado); quem é novo é ADICIONADO; quem não aparece na
 *    nova planilha é MANTIDO como estava (não é removido — uma planilha
 *    incompleta não apaga ninguém).
 * 2. Cada campo só é atualizado quando o novo valor passa por uma checagem de
 *    formato esperado para aquele campo (ex: admissão precisa parecer uma
 *    data, agência/conta precisa parecer "1234-5"). Se o novo valor não bate
 *    com o formato esperado, o valor antigo é mantido — isso é o que evita
 *    que um desalinhamento de coluna (ex: um código de banco caindo na coluna
 *    de admissão) corrompa um dado que já estava certo.
 * 3. "Optante do Vale Transporte" só é atualizado quando a nova planilha traz
 *    um "Sim"/"Não" reconhecível; um valor ambíguo mantém o que já estava
 *    cadastrado.
 */
export function mesclarFuncionarios(
  atuais: Funcionario[],
  novos: Funcionario[]
): { resultado: Funcionario[]; novosAdicionados: number; atualizados: number; mantidosSemAlteracao: number } {
  const porCpf = new Map<string, Funcionario>();
  const semCpf: Funcionario[] = [];

  for (const f of atuais) {
    if (f.cpf) porCpf.set(f.cpf, f);
    else semCpf.push(f);
  }

  let novosAdicionados = 0;
  let atualizados = 0;
  let mantidosSemAlteracao = 0;

  for (const novo of novos) {
    if (!novo.cpf) {
      // Sem CPF não dá pra ter certeza, mas tenta casar pelo nome (evita duplicar a
      // mesma pessoa a cada nova mesclagem só porque ela não tem CPF cadastrado).
      const idxExistente = semCpf.findIndex((f) => f.nomeNorm === novo.nomeNorm);
      if (idxExistente !== -1) {
        const { mesclado, mudou } = mesclarCampos(semCpf[idxExistente], novo);
        semCpf[idxExistente] = mesclado;
        if (mudou) atualizados++;
        else mantidosSemAlteracao++;
      } else {
        semCpf.push(novo);
        novosAdicionados++;
      }
      continue;
    }

    const existente = porCpf.get(novo.cpf);
    if (!existente) {
      porCpf.set(novo.cpf, novo);
      novosAdicionados++;
      continue;
    }

    const { mesclado, mudou } = mesclarCampos(existente, novo);
    porCpf.set(novo.cpf, mesclado);
    if (mudou) atualizados++;
    else mantidosSemAlteracao++;
  }

  return {
    resultado: [...porCpf.values(), ...semCpf],
    novosAdicionados,
    atualizados,
    mantidosSemAlteracao,
  };
}

function mesclarCampos(antigo: Funcionario, novo: Funcionario): { mesclado: Funcionario; mudou: boolean } {
  let mudou = false;

  function campoTexto(valorAntigo: unknown, valorNovo: unknown) {
    if (valorNovo === null || valorNovo === undefined || String(valorNovo).trim() === "") return valorAntigo;
    if (valorNovo !== valorAntigo) mudou = true;
    return valorNovo;
  }

  function campoComFormato(valorAntigo: unknown, valorNovo: unknown, valido: (v: unknown) => boolean) {
    if (valorNovo === null || valorNovo === undefined || String(valorNovo).trim() === "") return valorAntigo;
    if (!valido(valorNovo)) return valorAntigo; // formato inesperado — não arrisca, mantém o antigo
    if (!valoresEquivalentes(valorAntigo, valorNovo)) mudou = true;
    return valorNovo;
  }

  const optanteVT = novo.optanteVT === null || novo.optanteVT === undefined ? antigo.optanteVT : novo.optanteVT;
  if (novo.optanteVT !== null && novo.optanteVT !== undefined && novo.optanteVT !== antigo.optanteVT) mudou = true;

  const mesclado: Funcionario = {
    ...antigo,
    nome: (campoTexto(antigo.nome, novo.nome) as string) || antigo.nome,
    nomeNorm: (campoTexto(antigo.nomeNorm, novo.nomeNorm) as string) || antigo.nomeNorm,
    cpfFormatado: antigo.cpfFormatado || novo.cpfFormatado,
    polo: campoComFormato(antigo.polo, novo.polo, pareceRotuloDescritivo) as string | number | null,
    zonaEleitoral: campoTexto(antigo.zonaEleitoral, novo.zonaEleitoral) as string | number | null,
    municipioZona: campoTexto(antigo.municipioZona, novo.municipioZona) as string | null,
    municipioPolo: campoTexto(antigo.municipioPolo, novo.municipioPolo) as string | null,
    admissao: campoComFormato(antigo.admissao, novo.admissao, pareceDataIso) as string | null,
    banco: campoComFormato(antigo.banco, novo.banco, pareceCodigoBanco) as string | null,
    agencia: campoComFormato(antigo.agencia, novo.agencia, pareceAgenciaOuConta) as string | null,
    conta: campoComFormato(antigo.conta, novo.conta, pareceAgenciaOuConta) as string | null,
    optanteVT,
    telefone: campoComFormato(antigo.telefone, novo.telefone, pareceTelefone) as string | null,
    desligamento: campoComFormato(antigo.desligamento, novo.desligamento, pareceDataIso) as string | null,
    funcao: campoTexto(antigo.funcao, novo.funcao) as string | null,
    posicaoVaga: campoTexto(antigo.posicaoVaga, novo.posicaoVaga) as string | null,
    vinculo: campoTexto(antigo.vinculo, novo.vinculo) as string | null,
    status: campoTexto(antigo.status, novo.status) as string | null,
    substitui: campoTexto(antigo.substitui, novo.substitui) as string | null,
    observacao: campoTexto(antigo.observacao, novo.observacao) as string | null,
  };

  return { mesclado, mudou };
}

function pareceDataIso(v: unknown): boolean {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
}

/** Um rótulo de polo de verdade tem letras (ex: "P24 VITORIA DA CONQUISTA") — um
 * número solto (fallback usado quando a coluna "ABA DE ORIGEM" não existe na
 * planilha enviada) é uma informação pior, então não deve substituir um rótulo
 * descritivo que já existia. */
function pareceRotuloDescritivo(v: unknown): boolean {
  return typeof v === "string" && /[A-Za-zÀ-ÿ]/.test(v);
}

/** Compara dois valores considerando datas ISO equivalentes mesmo com formatos ligeiramente diferentes (ex: "2026-08-19" vs "2026-08-19T00:00:00"). */
function valoresEquivalentes(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "string" && typeof b === "string" && pareceDataIso(a) && pareceDataIso(b)) {
    return a.slice(0, 10) === b.slice(0, 10);
  }
  return false;
}

function pareceCodigoBanco(v: unknown): boolean {
  if (typeof v === "number") return true;
  if (typeof v !== "string") return false;
  return /^\d{1,4}$/.test(v.trim());
}

function pareceAgenciaOuConta(v: unknown): boolean {
  if (typeof v !== "string" && typeof v !== "number") return false;
  return /^\d+-[\dXx]$/.test(String(v).trim());
}

function pareceTelefone(v: unknown): boolean {
  if (typeof v !== "string" && typeof v !== "number") return false;
  const digitos = String(v).replace(/\D/g, "");
  return digitos.length >= 8 && digitos.length <= 13;
}
