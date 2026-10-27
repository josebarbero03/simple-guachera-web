import { validateCalf } from "./calves";
import type { CalfInput } from "./types";

export type BulkRow = { line: number; raw: string; value: CalfInput | null; error: string | null };

const HEADER = /caravana|tag|ternero|nacimiento|fecha/i;

export function parseDate(value: string): string | null {
  const v = value.trim();
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return build(+m[1], +m[2], +m[3]);
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) return build(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  return null;
}

function build(y: number, mo: number, d: number) {
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

function parseSex(value: string): CalfInput["sex"] | null {
  const v = value.trim().toLowerCase();
  if (!v || v === "h" || v.startsWith("hem")) return "Hembra";
  if (v === "m" || v.startsWith("mac")) return "Macho";
  return null;
}

/**
 * Columnas: Caravana, Fecha de nacimiento, Sexo, Peso al nacer, Ubicación.
 * Acepta lo copiado de Excel (tabulaciones) o CSV con ; o , como separador.
 */
export function parseBulkCalves(text: string, existingTags: string[], on: string): BulkRow[] {
  const lines = text.replace(/\r/g, "").split("\n").map((raw, i) => ({ raw, line: i + 1 })).filter((l) => l.raw.trim());
  if (!lines.length) return [];
  const sample = lines[0].raw;
  const sep = sample.includes("\t") ? "\t" : sample.includes(";") ? ";" : ",";
  const taken = new Set(existingTags.map((t) => t.trim().toLowerCase()));
  const seen = new Set<string>();
  const rows: BulkRow[] = [];

  lines.forEach(({ raw, line }, index) => {
    const cells = raw.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (index === 0 && HEADER.test(cells[0] ?? "") && !parseDate(cells[1] ?? "")) return;
    const [tag = "", date = "", sex = "", weight = "", location = ""] = cells;
    const birth_date = parseDate(date);
    const parsedSex = parseSex(sex);
    const birth_weight = weight ? Number(weight.replace(",", ".")) : null;
    const value: CalfInput = { tag, sex: parsedSex ?? "Hembra", birth_date: birth_date ?? "", birth_weight, location, notes: "" };
    let error = !birth_date ? `Fecha "${date}" no válida (usar dd/mm/aaaa)` : !parsedSex ? `Sexo "${sex}" no válido (H o M)` : validateCalf(value, on);
    const key = tag.toLowerCase();
    if (!error && taken.has(key)) error = "Ya existe un ternero activo con esa caravana";
    if (!error && seen.has(key)) error = "Caravana repetida en la lista";
    if (!error) seen.add(key);
    rows.push({ line, raw, value: error ? null : value, error });
  });
  return rows;
}
