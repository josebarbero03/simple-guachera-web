import type { Dose } from "./types";

const TZ = "America/Argentina/Buenos_Aires";

// Misma regla que simple_guachera_start_treatment: duración / intervalo, mínimo 1 dosis.
export function doseCount(intervalHours: number, durationDays: number) {
  return Math.max(1, Math.ceil((durationDays * 24) / intervalHours));
}

export function describeSchedule(intervalHours: number, durationDays: number) {
  const n = doseCount(intervalHours, durationDays);
  if (n === 1) return "Dosis única";
  const every = intervalHours % 24 === 0 ? (intervalHours === 24 ? "cada 24 h" : `cada ${intervalHours / 24} días`) : `cada ${intervalHours} h`;
  return `${n} dosis · ${every} · ${durationDays} ${durationDays === 1 ? "día" : "días"}`;
}

// Argentina no tiene horario de verano: UTC-3 fijo.
export function dayBounds(day: string) {
  return { start: new Date(`${day}T00:00:00-03:00`).toISOString(), end: new Date(`${day}T23:59:59.999-03:00`).toISOString() };
}

export function localInputToIso(value: string) {
  return new Date(`${value}:00-03:00`).toISOString();
}

export function nowLocalInput() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function formatTime(iso: string) {
  return new Intl.DateTimeFormat("es-AR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("es-AR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

export function progress(doses: Pick<Dose, "status" | "due_at">[]) {
  const done = doses.filter((d) => d.status === "Aplicada").length;
  const missed = doses.filter((d) => d.status === "No aplicada").length;
  const next = doses.filter((d) => d.status === "Pendiente").sort((a, b) => a.due_at.localeCompare(b.due_at))[0] ?? null;
  return { done, missed, total: doses.length, next };
}
