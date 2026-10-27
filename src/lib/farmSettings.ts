import { CATEGORIES } from "./calves";

export type CategoryDef = { name: string; minAgeDays: number; maxAgeDays: number };
export type FarmSettings = { categories: CategoryDef[]; logKinds: string[]; planLateDays: number };

export const DEFAULT_SETTINGS: FarmSettings = {
  categories: CATEGORIES.map((c) => ({ ...c })),
  logKinds: ["Alimentación", "Iniciador", "Agua", "Limpieza de cama", "Calostrado", "Observación", "Otro"],
  planLateDays: 14,
};

/** Configuración del establecimiento completada con los valores por defecto. */
export function settingsOf(farm: { settings?: Partial<FarmSettings> | null } | null | undefined): FarmSettings {
  const s = farm?.settings ?? {};
  return {
    categories: s.categories?.length ? [...s.categories].sort((a, b) => a.minAgeDays - b.minAgeDays) : DEFAULT_SETTINGS.categories,
    logKinds: s.logKinds?.length ? s.logKinds : DEFAULT_SETTINGS.logKinds,
    planLateDays: typeof s.planLateDays === "number" ? s.planLateDays : DEFAULT_SETTINGS.planLateDays,
  };
}

/** Mismas reglas que simple_guachera_update_farm_settings. */
export function validateSettings(s: FarmSettings): string | null {
  if (!s.categories.length) return "Definí al menos una categoría.";
  const sorted = [...s.categories].sort((a, b) => a.minAgeDays - b.minAgeDays);
  const names = new Set<string>();
  let previousMax = -1;
  for (const c of sorted) {
    if (!c.name.trim()) return "Cada categoría necesita un nombre.";
    const key = c.name.trim().toLowerCase();
    if (names.has(key)) return `La categoría "${c.name}" está repetida.`;
    names.add(key);
    if (!Number.isInteger(c.minAgeDays) || !Number.isInteger(c.maxAgeDays) || c.minAgeDays < 0 || c.maxAgeDays < c.minAgeDays) return `Revisá los días de "${c.name}": "hasta" debe ser mayor o igual que "desde".`;
    if (c.minAgeDays <= previousMax) return `Los rangos se superponen en "${c.name}".`;
    previousMax = c.maxAgeDays;
  }
  if (!s.logKinds.some((k) => k.trim())) return "Definí al menos un tipo de tarea.";
  if (!Number.isInteger(s.planLateDays) || s.planLateDays < 0 || s.planLateDays > 60) return "Los días de atraso deben estar entre 0 y 60.";
  return null;
}
