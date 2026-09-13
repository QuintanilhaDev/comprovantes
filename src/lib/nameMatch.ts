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

/** 1 = idêntico, 0 = nada a ver. Dá crédito extra para abreviações/iniciais. */
function similaridadeToken(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length >= 1 && b.startsWith(a)) return 0.93; // "C" ou "CA" abreviando "CARDOSO"
  if (b.length >= 1 && a.startsWith(b)) return 0.93;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return Math.max(0, 1 - dist / maxLen);
}

/**
 * Compara dois nomes já normalizados (normalizeName) e retorna um score de
 * 0 (nada a ver) a 1 (mesmo nome). Cada palavra da query precisa encontrar a
 * melhor palavra correspondente ainda não usada no candidato; o score final é
 * a média das melhores similaridades encontradas, contando como zero qualquer
 * palavra da query sem correspondência razoável (similaridade < 0.6).
 */
export function compararNomes(queryNorm: string, candidatoNorm: string): number {
  const qTokens = queryNorm.split(" ").filter(Boolean);
  const cTokens = candidatoNorm.split(" ").filter(Boolean);
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
    if (melhorIdx !== -1 && melhorSim >= 0.6) {
      usados.add(melhorIdx);
      soma += melhorSim;
    }
  }

  return soma / qTokens.length;
}
