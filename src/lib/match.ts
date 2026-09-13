import type { Funcionario } from "./types";
import { compararNomes } from "./nameMatch";

/**
 * Verifica se `curto` pode ser uma versão abreviada/truncada de `completo`.
 * Cobre casos comuns de comprovantes bancários, como:
 *   "SHARLSTON C SANTOS"      -> "SHARLSTON CARDOSO SANTOS" (inicial no meio)
 *   "REINAN D VIEIRA LIMA"    -> "REINAN DRUMMOND VIEIRA LIMA"
 *   "MARIA EDUARDA DA SILV"   -> "MARIA EDUARDA DA SILVA" (nome cortado por limite de caracteres)
 */
function ehVariacaoDoMesmoNome(curto: string, completo: string): boolean {
  const a = curto.split(" ").filter(Boolean);
  const b = completo.split(" ").filter(Boolean);
  if (a.length < 2 || b.length < 2) return false;

  // Nome truncado no fim (ex: "MARIA EDUARDA DA SILV" vs "MARIA EDUARDA DA SILVA"):
  // junta tudo em uma string sem espaço e compara prefixo, exigindo boa cobertura.
  const juntoA = a.join("");
  const juntoB = b.join("");
  if (juntoA.length >= 8 && juntoB.startsWith(juntoA) && juntoB.length - juntoA.length <= 4) {
    return true;
  }

  // Nome com alguma palavra abreviada para inicial (ou início) no meio:
  if (a.length === b.length || a.length < b.length) {
    let i = 0;
    let j = 0;
    let diferencas = 0;
    while (i < a.length && j < b.length) {
      const ta = a[i];
      const tb = b[j];
      if (ta === tb) {
        i++;
        j++;
        continue;
      }
      if (ta.length <= 2 && tb.startsWith(ta)) {
        // inicial ou abreviação curta (ex: "C" ou "CA" para "CARDOSO")
        i++;
        j++;
        continue;
      }
      if (ta.length >= 3 && tb.startsWith(ta)) {
        // palavra cortada (ex: "DRUM" para "DRUMMOND")
        i++;
        j++;
        continue;
      }
      // tenta pular uma palavra do nome completo (sobrenome composto, "DE", "DOS" etc.)
      diferencas++;
      j++;
      if (diferencas > 1) return false;
    }
    return i === a.length;
  }

  return false;
}

/**
 * Encontra o funcionário correspondente a um nome/CPF vindos de um comprovante ou
 * relatório, tolerando nomes abreviados/truncados e pequenos erros de digitação.
 * Usa (em ordem de confiança): CPF exato -> nome exato -> variação/abreviação
 * conhecida -> busca aproximada (fuzzy).
 */
export function matchFuncionario(
  nomeNorm: string,
  cpf: string | null | undefined,
  funcionarios: Funcionario[],
  cpfIndex: Map<string, Funcionario>,
  nomeIndex: Map<string, Funcionario>,
  porPrimeiraPalavra?: Map<string, Funcionario[]>
): Funcionario | null {
  if (cpf && cpfIndex.has(cpf)) return cpfIndex.get(cpf)!;
  if (nomeNorm && nomeIndex.has(nomeNorm)) return nomeIndex.get(nomeNorm)!;
  if (!nomeNorm) return null;

  // Só compara com candidatos que compartilham a primeira palavra do nome
  // (evita comparar contra os ~1500 funcionários inteiros a cada chamada).
  const primeiraPalavra = nomeNorm.split(" ")[0];
  const candidatos = porPrimeiraPalavra?.get(primeiraPalavra) || funcionarios;
  for (const f of candidatos) {
    if (ehVariacaoDoMesmoNome(nomeNorm, f.nomeNorm) || ehVariacaoDoMesmoNome(f.nomeNorm, nomeNorm)) {
      return f;
    }
  }

  // Já não achou por abreviação — tenta por similaridade de palavras (mesmo
  // grupo de "primeira palavra" já usado acima; se não achou nada lá, tenta a
  // lista inteira como último recurso).
  let melhorCandidato: Funcionario | null = null;
  let melhorSimilaridade = 0;
  for (const f of candidatos.length > 0 ? candidatos : funcionarios) {
    const sim = compararNomes(nomeNorm, f.nomeNorm);
    if (sim > melhorSimilaridade) {
      melhorSimilaridade = sim;
      melhorCandidato = f;
    }
  }
  if (melhorCandidato && melhorSimilaridade >= 0.75) return melhorCandidato;

  return null;
}

export function buildFuncionarioIndexes(funcionarios: Funcionario[]) {
  const cpfIndex = new Map<string, Funcionario>();
  const nomeIndex = new Map<string, Funcionario>();
  const porPrimeiraPalavra = new Map<string, Funcionario[]>();
  for (const f of funcionarios) {
    if (f.cpf) cpfIndex.set(f.cpf, f);
    if (f.nomeNorm && !nomeIndex.has(f.nomeNorm)) nomeIndex.set(f.nomeNorm, f);
    const primeira = f.nomeNorm.split(" ")[0];
    if (primeira) {
      const arr = porPrimeiraPalavra.get(primeira) || [];
      arr.push(f);
      porPrimeiraPalavra.set(primeira, arr);
    }
  }
  return { cpfIndex, nomeIndex, porPrimeiraPalavra };
}
