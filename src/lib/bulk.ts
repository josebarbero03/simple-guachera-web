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

// ───── Carga masiva de registros sobre terneros existentes ─────

export type CalfRef = { id: string; tag: string; birth_date: string; active: boolean };
export type ProtocolRef = { id: string; name: string; kind: string; active: boolean };
export type Row<T> = { line: number; raw: string; value: T | null; error: string | null; summary: string };

type Cells = { line: number; raw: string; cells: string[] };

/** Divide el texto pegado en filas y celdas; descarta un encabezado que empiece con "Caravana". */
export function splitTable(text: string): Cells[] {
  const lines = text.replace(/\r/g, "").split("\n").map((raw, i) => ({ raw, line: i + 1 })).filter((l) => l.raw.trim());
  if (!lines.length) return [];
  const sample = lines[0].raw;
  const sep = sample.includes("\t") ? "\t" : sample.includes(";") ? ";" : ",";
  const rows = lines.map(({ raw, line }) => ({ raw, line, cells: raw.split(sep).map((c) => c.trim().replace(/^"|"$/g, "")) }));
  return /^(caravana|tag|ternero)/i.test(rows[0].cells[0] ?? "") ? rows.slice(1) : rows;
}

function calfIndex(calves: CalfRef[]) {
  const index = new Map<string, CalfRef>();
  // Si hay varias con la misma caravana, gana la activa.
  for (const c of [...calves].sort((a, b) => Number(a.active) - Number(b.active))) index.set(c.tag.trim().toLowerCase(), c);
  return index;
}

const num = (v: string) => (v.trim() ? Number(v.trim().replace(",", ".")) : null);
const fmtNum = (v: number | null, unit = "") => (v === null ? "" : `${String(v).replace(".", ",")}${unit}`);

function rowsWith<T>(text: string, calves: CalfRef[], parse: (cells: string[], calf: CalfRef) => { value?: T; error?: string; summary?: string; key?: string }): Row<T>[] {
  const index = calfIndex(calves);
  const seen = new Set<string>();
  return splitTable(text).map(({ line, raw, cells }) => {
    const tag = cells[0] ?? "";
    const calf = index.get(tag.trim().toLowerCase());
    if (!tag.trim()) return { line, raw, value: null, error: "Falta la caravana", summary: "" };
    if (!calf) return { line, raw, value: null, error: `No existe un ternero con caravana ${tag}`, summary: "" };
    const r = parse(cells, calf);
    let error = r.error ?? null;
    if (!error && r.key) { if (seen.has(r.key)) error = "Fila repetida en la lista"; else seen.add(r.key); }
    return { line, raw, value: error ? null : r.value ?? null, error, summary: `${calf.tag}${r.summary ? ` · ${r.summary}` : ""}` };
  });
}

/** Caravana · Fecha · Peso (kg) */
export function parseWeights(text: string, calves: CalfRef[], on: string) {
  return rowsWith<{ calf_id: string; weighed_at: string; weight: number }>(text, calves, ([, d = "", w = ""], calf) => {
    const date = parseDate(d), weight = num(w);
    if (!date) return { error: `Fecha "${d}" no válida (dd/mm/aaaa)` };
    if (date < calf.birth_date || date > on) return { error: "La fecha debe estar entre el nacimiento y hoy" };
    if (weight === null || !Number.isFinite(weight) || weight <= 0 || weight >= 1000) return { error: `Peso "${w}" no válido` };
    return { value: { calf_id: calf.id, weighed_at: date, weight }, summary: `${d} · ${fmtNum(weight, " kg")}`, key: `${calf.id}|${date}` };
  });
}

export type ColostrumRow = { id: string; colostrum_liters: number | null; colostrum_brix: number | null; colostrum_hours: number | null; serum_tp: number | null; serum_brix: number | null };
/** Caravana · Litros · Brix calostro % · Horas de vida · Proteína total g/dL · Brix suero % */
export function parseColostrum(text: string, calves: CalfRef[]) {
  return rowsWith<ColostrumRow>(text, calves, ([, l = "", b = "", h = "", tp = "", sb = ""], calf) => {
    const v = { colostrum_liters: num(l), colostrum_brix: num(b), colostrum_hours: num(h), serum_tp: num(tp), serum_brix: num(sb) };
    const bad = (x: number | null, min: number, max: number) => x !== null && (!Number.isFinite(x) || x < min || x > max);
    if (Object.values(v).every((x) => x === null)) return { error: "La fila no tiene datos" };
    if (bad(v.colostrum_liters, 0, 10)) return { error: "Litros entre 0 y 10" };
    if (bad(v.colostrum_brix, 0, 40)) return { error: "Brix del calostro entre 0 y 40" };
    if (bad(v.colostrum_hours, 0, 72)) return { error: "Horas de vida entre 0 y 72" };
    if (bad(v.serum_tp, 2, 12)) return { error: "Proteína total entre 2 y 12 g/dL" };
    if (bad(v.serum_brix, 4, 15)) return { error: "Brix en suero entre 4 y 15" };
    const parts = [fmtNum(v.colostrum_liters, " L"), fmtNum(v.colostrum_brix, "% Brix"), fmtNum(v.colostrum_hours, " h"), v.serum_tp !== null ? `PT ${fmtNum(v.serum_tp)}` : "", v.serum_brix !== null ? `Brix suero ${fmtNum(v.serum_brix)}` : ""];
    return { value: { id: calf.id, ...v }, summary: parts.filter(Boolean).join(" · "), key: calf.id };
  });
}

export type TreatmentRow = { calf_id: string; protocol_id: string; start_at: string; severity: "Leve" | "Moderado" | "Grave"; diagnosis: string };
/** Caravana · Protocolo · Fecha inicio · Hora (opcional, 08:00) · Gravedad (opcional, Leve) · Diagnóstico (opcional) */
export function parseTreatments(text: string, calves: CalfRef[], protocols: ProtocolRef[], on: string) {
  const byName = new Map(protocols.filter((p) => p.active && p.kind === "Tratamiento").map((p) => [p.name.trim().toLowerCase(), p]));
  return rowsWith<TreatmentRow>(text, calves, ([, pName = "", d = "", h = "", s = "", diag = ""], calf) => {
    if (!calf.active) return { error: "El ternero está dado de baja" };
    const protocol = byName.get(pName.trim().toLowerCase());
    if (!protocol) return { error: `No hay un protocolo de tratamiento activo llamado "${pName}"` };
    const date = parseDate(d);
    if (!date) return { error: `Fecha "${d}" no válida (dd/mm/aaaa)` };
    if (date < calf.birth_date) return { error: "La fecha es anterior al nacimiento" };
    if (date > on) return { error: "La fecha no puede ser futura" };
    const hour = h.trim() || "08:00";
    if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(hour)) return { error: `Hora "${h}" no válida (hh:mm)` };
    const sv = s.trim().toLowerCase();
    const severity = !sv || sv.startsWith("le") ? "Leve" : sv.startsWith("mo") ? "Moderado" : sv.startsWith("gr") ? "Grave" : null;
    if (!severity) return { error: `Gravedad "${s}" no válida (Leve, Moderado o Grave)` };
    const start_at = new Date(`${date}T${hour.padStart(5, "0")}:00-03:00`).toISOString();
    return { value: { calf_id: calf.id, protocol_id: protocol.id, start_at, severity, diagnosis: diag.trim() }, summary: `${protocol.name} · ${d} ${hour} · ${severity}`, key: `${calf.id}|${protocol.id}|${start_at}` };
  });
}

export type ExitRow = { id: string; exit_date: string; exit_reason: "Muerte" | "Venta" | "Traslado" | "Otro"; exit_cause: string };
/** Caravana · Fecha · Motivo (Muerte, Venta, Traslado, Otro) · Causa */
export function parseExits(text: string, calves: CalfRef[], on: string) {
  return rowsWith<ExitRow>(text, calves, ([, d = "", m = "", cause = ""], calf) => {
    if (!calf.active) return { error: "El ternero ya está dado de baja" };
    const date = parseDate(d);
    if (!date || date < calf.birth_date || date > on) return { error: `Fecha "${d}" no válida` };
    const reason = (["Muerte", "Venta", "Traslado", "Otro"] as const).find((r) => r.toLowerCase() === m.trim().toLowerCase() || (m.trim().toLowerCase() === "murio" || m.trim().toLowerCase() === "murió") && r === "Muerte");
    if (!reason) return { error: `Motivo "${m}" no válido (Muerte, Venta, Traslado u Otro)` };
    return { value: { id: calf.id, exit_date: date, exit_reason: reason, exit_cause: cause.trim() }, summary: `${reason} · ${d}${cause ? ` · ${cause}` : ""}`, key: calf.id };
  });
}

/** Caravana · Fecha de destete · Peso (opcional) */
export function parseWeaning(text: string, calves: CalfRef[], on: string) {
  return rowsWith<{ id: string; weaning_date: string; weaning_weight: number | null }>(text, calves, ([, d = "", w = ""], calf) => {
    const date = parseDate(d), weight = num(w);
    if (!date || date < calf.birth_date || date > on) return { error: `Fecha "${d}" no válida` };
    if (weight !== null && (!Number.isFinite(weight) || weight <= 0 || weight >= 1000)) return { error: `Peso "${w}" no válido` };
    return { value: { id: calf.id, weaning_date: date, weaning_weight: weight }, summary: `${d}${weight !== null ? ` · ${fmtNum(weight, " kg")}` : ""}`, key: calf.id };
  });
}
