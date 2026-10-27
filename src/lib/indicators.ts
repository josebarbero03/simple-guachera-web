import { addDays, daysBetween } from "./calves";
import type { Calf, Dose, Severity, Treatment, Weight } from "./types";

// ───── Referencias ─────
// DCHA Gold Standards: mortalidad 1–60 días < 5 %, diarreas < 25 %, neumonías < 10 %, duplicar el peso al nacer a los 60 días.
// Lombard et al. 2020 (J. Dairy Sci. 103:7611): transferencia de inmunidad pasiva por proteína total / Brix en suero,
//   metas de rodeo > 40 % excelente, 30 % buena, 20 % regular, < 10 % pobre.
// INIA Uruguay: calostrado correcto = al menos 4 L de calostro de buena calidad (> 22 % Brix) lo antes posible.
// Ganancia diaria predestete óptima > 0,8 kg/día (Engormix).

export type Level = "ok" | "warn" | "bad" | "none";

export type TpiCategory = "Excelente" | "Buena" | "Regular" | "Pobre";
export const TPI_CATEGORIES: TpiCategory[] = ["Excelente", "Buena", "Regular", "Pobre"];
export const TPI_TARGET: Record<TpiCategory, string> = { Excelente: "> 40 %", Buena: "≈ 30 %", Regular: "≈ 20 %", Pobre: "< 10 %" };

export function tpiCategory(calf: Pick<Calf, "serum_tp" | "serum_brix">): TpiCategory | null {
  if (calf.serum_tp != null) {
    const v = Number(calf.serum_tp);
    return v >= 6.2 ? "Excelente" : v >= 5.8 ? "Buena" : v >= 5.1 ? "Regular" : "Pobre";
  }
  if (calf.serum_brix != null) {
    const v = Number(calf.serum_brix);
    return v >= 9.4 ? "Excelente" : v >= 8.9 ? "Buena" : v >= 8.1 ? "Regular" : "Pobre";
  }
  return null;
}

export const SEVERITY_STYLE: Record<Severity, { card: string; badge: string; dot: string }> = {
  Grave: { card: "border-rose-300 border-l-[6px] border-l-rose-600", badge: "bg-rose-600 text-white", dot: "bg-rose-600" },
  Moderado: { card: "border-amber-300 border-l-[6px] border-l-amber-500", badge: "bg-amber-400 text-amber-950", dot: "bg-amber-500" },
  Leve: { card: "border-emerald-200 border-l-[6px] border-l-emerald-500", badge: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
};
export const SEVERITY_ORDER: Record<Severity, number> = { Grave: 0, Moderado: 1, Leve: 2 };

/** Nivel según una meta: "max" = el valor debe quedar por debajo, "min" = por encima. */
export function level(value: number | null, good: number, warn: number, kind: "max" | "min"): Level {
  if (value === null || !Number.isFinite(value)) return "none";
  if (kind === "max") return value < good ? "ok" : value <= warn ? "warn" : "bad";
  return value >= good ? "ok" : value >= warn ? "warn" : "bad";
}

const pct = (part: number, total: number) => (total ? (part / total) * 100 : null);
const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

type Input = {
  calves: Calf[];
  weights: Pick<Weight, "calf_id" | "weighed_at" | "weight">[];
  treatments: Pick<Treatment, "calf_id" | "start_at" | "disease_group" | "status" | "outcome" | "closed_at">[];
  doses: Pick<Dose, "status" | "due_at">[];
  from: string;
  to: string;
  now?: string;
};

export function computeIndicators({ calves, weights, treatments, doses, from, to, now = new Date().toISOString() }: Input) {
  const inRange = (d: string | null | undefined) => !!d && d.slice(0, 10) >= from && d.slice(0, 10) <= to;
  const byId = new Map(calves.map((c) => [c.id, c]));

  // Terneros que estuvieron en guachera (1–60 días de vida) durante el período.
  const atRisk = calves.filter((c) => c.birth_date <= to && addDays(c.birth_date, 60) >= from && !(c.exit_date && c.exit_date < from));
  const deaths = calves.filter((c) => c.exit_reason === "Muerte" && inRange(c.exit_date));
  const ageAtExit = (c: Calf) => daysBetween(c.birth_date, c.exit_date!);
  const deaths60 = deaths.filter((c) => ageAtExit(c) >= 1 && ageAtExit(c) <= 60);
  const deaths24h = deaths.filter((c) => ageAtExit(c) < 1);
  const deathsLater = deaths.filter((c) => ageAtExit(c) > 60);
  const causes = new Map<string, number>();
  for (const c of deaths) { const k = c.exit_cause.trim() || "Sin causa registrada"; causes.set(k, (causes.get(k) ?? 0) + 1); }

  // Morbilidad: terneros con al menos un tratamiento del grupo, iniciado en el período antes de los 60 días.
  const sick = (group: string) => new Set(treatments.filter((t) => t.disease_group === group && inRange(t.start_at) && byId.has(t.calf_id) && daysBetween(byId.get(t.calf_id)!.birth_date, t.start_at) <= 60).map((t) => t.calf_id)).size;
  const diarrhea = sick("Diarrea"), respiratory = sick("Respiratoria"), navel = sick("Ombligo");
  const treatedCalves = new Set(treatments.filter((t) => inRange(t.start_at)).map((t) => t.calf_id));
  const retreated = [...treatedCalves].filter((id) => treatments.filter((t) => t.calf_id === id && inRange(t.start_at)).length > 1).length;
  const closed = treatments.filter((t) => t.status === "Finalizado" && inRange(t.closed_at));

  // Ganancia diaria desde el nacimiento: última pesada del período entre 14 y 75 días de vida.
  const latest = new Map<string, { age: number; weight: number }>();
  for (const w of weights) {
    const c = byId.get(w.calf_id);
    if (!c?.birth_weight || !inRange(w.weighed_at)) continue;
    const age = daysBetween(c.birth_date, w.weighed_at);
    if (age < 14 || age > 75) continue;
    const prev = latest.get(c.id);
    if (!prev || age > prev.age) latest.set(c.id, { age, weight: Number(w.weight) });
  }
  const gains = [...latest.entries()].map(([id, p]) => ({ id, gdp: (p.weight - Number(byId.get(id)!.birth_weight)) / p.age }));
  const doubling = gains.filter((g) => g.gdp >= Number(byId.get(g.id)!.birth_weight) / 60).length;

  // Calostrado y transferencia de inmunidad pasiva de los nacidos en el período.
  const born = calves.filter((c) => inRange(c.birth_date));
  const tpi = new Map<TpiCategory, number>(TPI_CATEGORIES.map((k) => [k, 0]));
  for (const c of born) { const k = tpiCategory(c); if (k) tpi.set(k, tpi.get(k)! + 1); }
  const tpiMeasured = [...tpi.values()].reduce((a, b) => a + b, 0);
  const colostrumRecorded = born.filter((c) => c.colostrum_liters != null);
  const colostrumOk = colostrumRecorded.filter((c) => Number(c.colostrum_liters) >= 4 && (c.colostrum_brix == null || Number(c.colostrum_brix) >= 22));
  const early = born.filter((c) => c.colostrum_hours != null);

  // Destete.
  const weaned = calves.filter((c) => inRange(c.weaning_date));
  const weanAges = weaned.map((c) => daysBetween(c.birth_date, c.weaning_date!));
  const weanWeights = weaned.filter((c) => c.weaning_weight != null).map((c) => Number(c.weaning_weight));

  // Cumplimiento de dosis vencidas del período.
  const due = doses.filter((d) => inRange(d.due_at) && d.due_at <= now && d.status !== "Cancelada");
  const applied = due.filter((d) => d.status === "Aplicada").length;
  const missed = due.filter((d) => d.status === "No aplicada").length;
  const late = due.filter((d) => d.status === "Pendiente").length;

  return {
    atRisk: atRisk.length,
    born: born.length,
    mortality: { value: pct(deaths60.length, atRisk.length), deaths: deaths60.length, deaths24h: deaths24h.length, later: deathsLater.length, causes: [...causes.entries()].sort((a, b) => b[1] - a[1]) },
    diarrhea: { value: pct(diarrhea, atRisk.length), calves: diarrhea },
    respiratory: { value: pct(respiratory, atRisk.length), calves: respiratory },
    navel: { value: pct(navel, atRisk.length), calves: navel },
    treated: treatedCalves.size,
    retreated,
    recovered: { value: pct(closed.filter((t) => t.outcome === "Recuperado").length, closed.length), closed: closed.length },
    gdp: { value: avg(gains.map((g) => g.gdp)), calves: gains.length, doubling: pct(doubling, gains.length) },
    tpi: { measured: tpiMeasured, coverage: pct(tpiMeasured, born.length), share: TPI_CATEGORIES.map((k) => ({ category: k, count: tpi.get(k)!, value: pct(tpi.get(k)!, tpiMeasured) })) },
    colostrum: { recorded: colostrumRecorded.length, ok: pct(colostrumOk.length, colostrumRecorded.length), early: pct(early.filter((c) => Number(c.colostrum_hours) <= 2).length, early.length) },
    weaning: { count: weaned.length, age: avg(weanAges), weight: avg(weanWeights) },
    doses: { due: due.length, applied: pct(applied, due.length), missed, late },
  };
}

export type Indicators = ReturnType<typeof computeIndicators>;
