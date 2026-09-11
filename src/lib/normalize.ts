// Utilitários de normalização usados tanto na busca quanto na indexação.

/** Remove acentos de uma string. */
export function stripAccents(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Normaliza um nome para comparação: sem acento, maiúsculo, só letras e espaço único. */
export function normalizeName(input: string | null | undefined): string {
  if (!input) return "";
  const noAccents = stripAccents(input).toUpperCase();
  return noAccents
    .replace(/[^A-Z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extrai apenas os dígitos de um CPF (ou qualquer string). */
export function onlyDigits(input: string | null | undefined): string {
  if (!input) return "";
  return input.replace(/\D/g, "");
}

/** Normaliza um CPF para 11 dígitos com zeros à esquerda, ou string vazia se inválido. */
export function normalizeCpf(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "";
  const digits = onlyDigits(String(input));
  if (!digits) return "";
  return digits.padStart(11, "0").slice(-11);
}

/** Formata um CPF de 11 dígitos como 000.000.000-00. */
export function formatCpf(digits: string | null | undefined): string {
  if (!digits || digits.length !== 11) return digits || "";
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

/** Detecta se uma string de busca "parece" um CPF (majoritariamente dígitos). */
export function looksLikeCpf(query: string): boolean {
  const digits = onlyDigits(query);
  return digits.length >= 3 && digits.length / Math.max(query.trim().length, 1) > 0.5;
}

/** Converte "1.234,56" -> 1234.56 */
export function parseBrValor(input: string | null | undefined): number | null {
  if (!input) return null;
  const cleaned = input.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Formata número como moeda BRL simples (sem depender de Intl para previsibilidade em PDF/labels). */
export function formatBRL(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Converte data BR (dd/mm/aaaa) para ISO (aaaa-mm-dd). */
export function brDateToIso(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = input.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Formata data ISO (aaaa-mm-dd) para dd/mm/aaaa. */
export function isoDateToBr(input: string | null | undefined): string {
  if (!input) return "—";
  const m = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return input;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
