/**
 * Compara nomes por PALAVRA (token), em vez de fazer fuzzy-matching ingênuo na
 * string inteira. Isso é bem mais confiável para nomes brasileiros compostos:
 * ao buscar "JEAN OLIVEIRA", queremos que "JEAN CARLOS QUEIROZ OLIVEIRA" pontue
 * muito melhor do que "ADRIANO OLIVEIRA SANTOS" (que só compartilha um
 * sobrenome comum) — algo que bibliotecas de fuzzy-match genéricas por string
 * inteira (ex: Fuse.js) não garantem, já que comparam caracteres na string
 * toda sem noção de "palavra".
 */

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] =
        a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
    }
    prev = curr;
  }
  return prev[b.length];
}

const PALAVRAS_DE_LIGACAO = new Set(["DE", "DA", "DO", "DOS", "DAS", "E"]);

function tokenizarNome(nomeNorm: string): string[] {
  return nomeNorm.split(" ").filter((t) => t && !PALAVRAS_DE_LIGACAO.has(t));
}

/** 1 = idêntico, 0 = nada a ver. Dá crédito extra para iniciais verdadeiras. */
function similaridadeToken(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 1 && b.startsWith(a)) return 0.93; // "C" abreviando "CARDOSO"
  if (b.length === 1 && a.startsWith(b)) return 0.93;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return Math.max(0, 1 - dist / maxLen);
}

/**
 * Compara dois nomes já normalizados (normalizeName) e retorna um score de
 * 0 (nada a ver) a 1 (mesmo nome). Cada palavra da query (exceto conectivos
 * como "DE"/"DA"/"DOS") precisa encontrar a melhor palavra correspondente
 * ainda não usada no candidato; se QUALQUER palavra da query não encontrar
 * correspondência razoável (similaridade < 0.72), o nome inteiro é rejeitado
 * (retorna 0) em vez de apenas diluir a média — isso evita que uma palavra
 * completamente errada "passe" por causa das outras palavras baterem. O
 * limiar de 0.72 foi calibrado para aceitar erros de digitação comuns em
 * sobrenomes (ex: "CARDOSO"~"CARDOZO" = 0.86, "SOUZA"~"SOUSA" = 0.80,
 * "SANTOS"~"SANTO" = 0.83) e ao mesmo tempo rejeitar sobrenomes
 * realmente diferentes que por acaso têm tamanho parecido (ex:
 * "FERREIRA"~"MOREIRA" = 0.625, "SILVA"~"SILVEIRA" = 0.625) — esses dois
 * últimos casos já causaram atribuição errada de pagamento a pessoa errada.
 */
export function compararNomes(queryNorm: string, candidatoNorm: string): number {
  const qTokens = tokenizarNome(queryNorm);
  const cTokens = tokenizarNome(candidatoNorm);
  if (qTokens.length === 0 || cTokens.length === 0) return 0;

  const usados = new Set<number>();
  let soma = 0;

  for (const qt of qTokens) {
    let melhorIdx = -1;
    let melhorSim = 0;
    cTokens.forEach((ct, idx) => {
      if (usados.has(idx)) return;
      const sim = similaridadeToken(qt, ct);
      if (sim > melhorSim) {
        melhorSim = sim;
        melhorIdx = idx;
      }
    });
    if (melhorIdx === -1 || melhorSim < 0.72) return 0;
    usados.add(melhorIdx);
    soma += melhorSim;
  }

  return soma / qTokens.length;
}
