// Mismas categorías por edad que usa SInPLe Guachera.
export const CATEGORIES = [
  { name: "Guachera", minAgeDays: 0, maxAgeDays: 63 },
  { name: "Acostumbramiento", minAgeDays: 64, maxAgeDays: 150 },
  { name: "Recría", minAgeDays: 151, maxAgeDays: 300 },
] as const;

export function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function daysBetween(from: string, to: string) {
  return Math.floor((Date.parse(to.slice(0, 10) + "T12:00:00Z") - Date.parse(from.slice(0, 10) + "T12:00:00Z")) / 86_400_000);
}

export function addDays(day: string, days: number) {
  const d = new Date(day.slice(0, 10) + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function ageDays(birthDate: string, on = today()) {
  return daysBetween(birthDate, on);
}

type CategoryRange = { name: string; minAgeDays: number; maxAgeDays: number };

/** Categoría por edad según las categorías del establecimiento (o las de por defecto). Igual que simple_guachera_age_category. */
export function categoryFor(days: number, cats: readonly CategoryRange[] = CATEGORIES) {
  if (days < 0) return "Sin nacer";
  return cats.find((c) => days >= c.minAgeDays && days <= c.maxAgeDays)?.name ?? "Fuera de rango";
}

/** Categoría vigente: la asignada a mano o, si no hay, la que corresponde por edad. */
export function effectiveCategory(calf: { birth_date: string; category?: string | null }, on = today(), cats: readonly CategoryRange[] = CATEGORIES) {
  const byAge = categoryFor(ageDays(calf.birth_date, on), cats);
  const manual = calf.category ?? null;
  const range = cats.find((c) => c.name === manual);
  // Aviso cuando el ternero ya superó la edad máxima de la categoría asignada.
  const overdue = !!range && ageDays(calf.birth_date, on) > range.maxAgeDays;
  return { name: manual ?? byAge, manual: manual !== null, byAge, overdue };
}

export function formatAge(days: number) {
  if (days < 0) return "Fecha futura";
  if (days < 14) return `${days} ${days === 1 ? "día" : "días"}`;
  const weeks = Math.floor(days / 7);
  return `${days} días · ${weeks} sem`;
}

export function formatDate(value: string) {
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function formatKg(value: number) {
  return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(value)} kg`;
}

/** Número escrito a mano: acepta coma decimal; vacío = null; texto inválido = NaN. */
export function parseNum(value: string): number | null {
  const v = value.trim().replace(",", ".");
  return v ? Number(v) : null;
}

export function validateCalf(input: { tag: string; birth_date: string; birth_weight: number | null }, on = today()) {
  if (!input.tag.trim()) return "La caravana es obligatoria.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.birth_date)) return "Indicá la fecha de nacimiento.";
  if (input.birth_date > on) return "La fecha de nacimiento no puede ser futura.";
  if (input.birth_weight !== null && (!Number.isFinite(input.birth_weight) || input.birth_weight <= 0 || input.birth_weight > 120)) return "El peso al nacer debe estar entre 0 y 120 kg.";
  return null;
}
