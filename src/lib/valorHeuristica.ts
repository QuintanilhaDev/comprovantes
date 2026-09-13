import type { Pagamento, TipoBeneficio } from "./types";

/**
 * Constrói um mapa "valor exato -> tipo mais provável" a partir do histórico de
 * pagamentos já classificados com confiança (ex: vindos de relatórios que
 * declaram o tipo por linha). Só inclui um valor no mapa quando há uma amostra
 * mínima e um tipo claramente dominante (≥90%) — isso evita "inventar" um tipo
 * para valores raros ou ambíguos.
 *
 * Usado apenas como último recurso, quando nem o texto do comprovante nem o
 * nome do arquivo dizem se é Vale Transporte ou Auxílio (comum em lotes de
 * comprovantes de Pix, que não mencionam o tipo em lugar nenhum).
 */
export function construirMapaValorTipo(pagamentos: Pagamento[]): Map<number, TipoBeneficio> {
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
    if (total < 10) continue;
    const [tipoTop, qtdTop] = [...porTipo.entries()].sort((a, b) => b[1] - a[1])[0];
    if (qtdTop / total >= 0.9) mapa.set(valor, tipoTop);
  }
  return mapa;
}

export function sugerirTipoPorValor(valor: number | null, mapa: Map<number, TipoBeneficio>): TipoBeneficio | null {
  if (valor === null) return null;
  return mapa.get(Math.round(valor * 100) / 100) || null;
}
