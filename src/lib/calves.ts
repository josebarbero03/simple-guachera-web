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

export function ageDays(birthDate: string, on = today()) {
  return daysBetween(birthDate, on);
}

export function categoryFor(days: number) {
  if (days < 0) return "Sin nacer";
  return CATEGORIES.find((c) => days >= c.minAgeDays && days <= c.maxAgeDays)?.name ?? "Fuera de recría";
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

export function validateCalf(input: { tag: string; birth_date: string; birth_weight: number | null }, on = today()) {
  if (!input.tag.trim()) return "La caravana es obligatoria.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.birth_date)) return "Indicá la fecha de nacimiento.";
  if (input.birth_date > on) return "La fecha de nacimiento no puede ser futura.";
  if (input.birth_weight !== null && (!Number.isFinite(input.birth_weight) || input.birth_weight <= 0 || input.birth_weight > 120)) return "El peso al nacer debe estar entre 0 y 120 kg.";
  return null;
}
