import { describe, expect, it } from "vitest";
import { dayBounds, describeSchedule, doseCount, localInputToIso, progress } from "../src/lib/treatments";
import { parseBulkCalves, parseDate } from "../src/lib/bulk";
import { isManager } from "../src/lib/roles";

describe("dosis", () => {
  it("calcula la cantidad de dosis igual que la base", () => {
    expect(doseCount(24, 3)).toBe(3);
    expect(doseCount(12, 3)).toBe(6);
    expect(doseCount(48, 5)).toBe(3);
    expect(doseCount(72, 1)).toBe(1);
  });
  it("describe el esquema", () => {
    expect(describeSchedule(24, 1)).toBe("Dosis única");
    expect(describeSchedule(12, 3)).toBe("6 dosis · cada 12 h · 3 días");
    expect(describeSchedule(48, 6)).toBe("3 dosis · cada 2 días · 6 días");
  });
  it("usa la hora de Argentina", () => {
    expect(localInputToIso("2026-10-27T08:00")).toBe("2026-10-27T11:00:00.000Z");
    expect(dayBounds("2026-10-27")).toEqual({ start: "2026-10-27T03:00:00.000Z", end: "2026-10-28T02:59:59.999Z" });
  });
  it("resume el avance", () => {
    const p = progress([
      { status: "Aplicada", due_at: "2026-10-27T11:00:00Z" },
      { status: "No aplicada", due_at: "2026-10-27T23:00:00Z" },
      { status: "Pendiente", due_at: "2026-10-29T11:00:00Z" },
      { status: "Pendiente", due_at: "2026-10-28T11:00:00Z" },
    ]);
    expect(p).toMatchObject({ done: 1, missed: 1, total: 4 });
    expect(p.next?.due_at).toBe("2026-10-28T11:00:00Z");
  });
});

describe("roles", () => {
  it("productor y veterinario gestionan; operario no", () => {
    expect(isManager("propietario")).toBe(true);
    expect(isManager("productor")).toBe(true);
    expect(isManager("veterinario")).toBe(true);
    expect(isManager("operario")).toBe(false);
    expect(isManager(null)).toBe(false);
  });
});

describe("carga masiva", () => {
  const on = "2026-10-27";
  it("interpreta fechas comunes", () => {
    expect(parseDate("05/10/2026")).toBe("2026-10-05");
    expect(parseDate("5/10/26")).toBe("2026-10-05");
    expect(parseDate("2026-10-05")).toBe("2026-10-05");
    expect(parseDate("31/02/2026")).toBeNull();
  });
  it("lee lo copiado de Excel, saltea encabezado y marca errores", () => {
    const text = "Caravana\tNacimiento\tSexo\tPeso\tUbicación\n2418\t15/10/2026\tH\t38,5\tEstaca A\n2419\t16/10/2026\tM\t\t\n2418\t17/10/2026\tH\t40\t\n2420\t32/10/2026\tH\t\t\n2421\t17/10/2026\tX\t\t\n9999\t17/10/2026\t\t\t\n";
    const rows = parseBulkCalves(text, ["9999"], on);
    expect(rows.map((r) => r.error === null)).toEqual([true, true, false, false, false, false]);
    expect(rows[0].value).toMatchObject({ tag: "2418", birth_date: "2026-10-15", sex: "Hembra", birth_weight: 38.5, location: "Estaca A" });
    expect(rows[1].value).toMatchObject({ sex: "Macho", birth_weight: null });
    expect(rows[2].error).toMatch(/repetida/);
    expect(rows[3].error).toMatch(/Fecha/);
    expect(rows[4].error).toMatch(/Sexo/);
    expect(rows[5].error).toMatch(/Ya existe/);
  });
  it("acepta CSV con punto y coma", () => {
    const rows = parseBulkCalves("A1;01/10/2026;Macho;39,5;Corral 1", [], on);
    expect(rows[0].value).toMatchObject({ tag: "A1", sex: "Macho", birth_weight: 39.5, location: "Corral 1" });
  });
});

import { parseColostrum, parseExits, parseTreatments, parseWeaning, parseWeights, splitTable } from "../src/lib/bulk";

describe("carga masiva de registros", () => {
  const on = "2026-10-27";
  const calves = [
    { id: "c1", tag: "2418", birth_date: "2026-10-01", active: true },
    { id: "old", tag: "2419", birth_date: "2025-01-01", active: false },
    { id: "c2", tag: "2419", birth_date: "2026-10-05", active: true },
    { id: "gone", tag: "9000", birth_date: "2026-09-01", active: false },
  ];
  it("saltea encabezado y prefiere el ternero activo con caravana repetida", () => {
    expect(splitTable("Caravana;Fecha;Peso\n2418;20/10/2026;45").length).toBe(1);
    expect(parseWeights("2419\t20/10/2026\t44", calves, on)[0].value?.calf_id).toBe("c2");
  });
  it("pesadas: valida fecha, peso, caravana y repetidas", () => {
    const r = parseWeights("2418;20/10/2026;45,5\n2418;20/10/2026;46\n2418;25/09/2026;40\n7777;20/10/2026;40\n2419;21/10/2026;abc", calves, on);
    expect(r[0].value).toEqual({ calf_id: "c1", weighed_at: "2026-10-20", weight: 45.5 });
    expect(r.slice(1).map((x) => x.error)).toEqual(["Fila repetida en la lista", "La fecha debe estar entre el nacimiento y hoy", "No existe un ternero con caravana 7777", 'Peso "abc" no válido']);
  });
  it("calostrado acepta columnas vacías y valida rangos", () => {
    const r = parseColostrum("2418;4;24;1;6,3;\n2419;;;;;9,1\n2418;20", calves);
    expect(r[0].value).toMatchObject({ colostrum_liters: 4, colostrum_brix: 24, serum_tp: 6.3, serum_brix: null });
    expect(r[1].value).toMatchObject({ serum_brix: 9.1, colostrum_liters: null });
    expect(r[2].error).toMatch(/Litros|repetida/);
  });
  it("tratamientos: protocolo por nombre, hora y gravedad por defecto", () => {
    const protocols = [{ id: "p1", name: "Diarrea", kind: "Tratamiento", active: true }, { id: "v", name: "Vacuna", kind: "Plan sanitario", active: true }];
    const r = parseTreatments("2418;diarrea;20/10/2026\n2419;Diarrea;21/10/2026;18:30;grave;Deshidratado\n2418;Vacuna;20/10/2026\n9000;Diarrea;20/10/2026\n2418;Diarrea;20/10/2026;9:00;urgente", calves, protocols, on);
    expect(r[0].value).toEqual({ calf_id: "c1", protocol_id: "p1", start_at: "2026-10-20T11:00:00.000Z", severity: "Leve", diagnosis: "" });
    expect(r[1].value).toMatchObject({ severity: "Grave", diagnosis: "Deshidratado", start_at: "2026-10-21T21:30:00.000Z" });
    expect(r[2].error).toMatch(/protocolo/);
    expect(r[3].error).toMatch(/baja/);
    expect(r[4].error).toMatch(/Gravedad/);
  });
  it("bajas y destete", () => {
    const e = parseExits("2418;26/10/2026;muerte;Neumonía\n2419;26/10/2026;robo", calves, on);
    expect(e[0].value).toEqual({ id: "c1", exit_date: "2026-10-26", exit_reason: "Muerte", exit_cause: "Neumonía" });
    expect(e[1].error).toMatch(/Motivo/);
    const w = parseWeaning("2418;26/10/2026;80\n2419;26/10/2026", calves, on);
    expect(w.map((x) => x.value?.weaning_weight)).toEqual([80, null]);
  });
});

import { parseCategories } from "../src/lib/bulk";

describe("carga masiva de categorías", () => {
  const calves = [{ id: "c1", tag: "2418", birth_date: "2026-08-01", active: true }, { id: "x", tag: "9", birth_date: "2026-08-01", active: false }];
  const names = ["Guachera", "Acostumbramiento", "Recría"];
  it("acepta nombres sin tildes, fecha opcional y automática", () => {
    const r = parseCategories("Caravana;Categoria;Fecha\n2418;recria;20/10/2026;Lote 3", calves, names, "2026-10-27");
    expect(r[0].value).toEqual({ calf_id: "c1", category: "Recría", moved_on: "2026-10-20", notes: "Lote 3" });
    expect(parseCategories("2418;Automática", calves, names, "2026-10-27")[0].value).toMatchObject({ category: "", moved_on: "2026-10-27" });
  });
  it("rechaza categorías desconocidas y terneros dados de baja", () => {
    expect(parseCategories("2418;Vaquillona", calves, names, "2026-10-27")[0].error).toMatch(/no válida/);
    expect(parseCategories("9;Recría", calves, names, "2026-10-27")[0].error).toMatch(/baja/);
  });
});

import { describePlanDays } from "../src/lib/treatments";
describe("plan sanitario por rango", () => {
  it("describe uno o varios días", () => {
    expect(describePlanDays(15, null)).toBe("día 15 de vida");
    expect(describePlanDays(10, 20)).toBe("días 10 a 20 de vida");
    expect(describePlanDays(10, 10)).toBe("día 10 de vida");
  });
});
