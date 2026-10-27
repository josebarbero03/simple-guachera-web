import { describe, expect, it } from "vitest";
import { computeIndicators, level, tpiCategory } from "../src/lib/indicators";
import type { Calf } from "../src/lib/types";

const calf = (id: string, birth: string, extra: Partial<Calf> = {}): Calf => ({
  id, farm_id: "f", tag: id, sex: "Hembra", birth_date: birth, birth_weight: 40, location: "", notes: "", active: true,
  colostrum_liters: null, colostrum_brix: null, colostrum_hours: null, serum_tp: null, serum_brix: null,
  weaning_date: null, weaning_weight: null, exit_date: null, exit_reason: null, exit_cause: "", category: null, created_at: "", updated_at: "", ...extra,
});

describe("inmunidad pasiva (Lombard 2020)", () => {
  it("clasifica por proteína total y, si falta, por Brix", () => {
    expect(tpiCategory({ serum_tp: 6.2, serum_brix: null })).toBe("Excelente");
    expect(tpiCategory({ serum_tp: 5.8, serum_brix: null })).toBe("Buena");
    expect(tpiCategory({ serum_tp: 5.1, serum_brix: null })).toBe("Regular");
    expect(tpiCategory({ serum_tp: 5.0, serum_brix: 9.9 })).toBe("Pobre");
    expect(tpiCategory({ serum_tp: null, serum_brix: 9.4 })).toBe("Excelente");
    expect(tpiCategory({ serum_tp: null, serum_brix: 8.0 })).toBe("Pobre");
    expect(tpiCategory({ serum_tp: null, serum_brix: null })).toBeNull();
  });
});

describe("semáforo", () => {
  it("evalúa metas máximas y mínimas", () => {
    expect(level(4, 5, 10, "max")).toBe("ok");
    expect(level(7, 5, 10, "max")).toBe("warn");
    expect(level(12, 5, 10, "max")).toBe("bad");
    expect(level(0.85, 0.8, 0.6, "min")).toBe("ok");
    expect(level(0.7, 0.8, 0.6, "min")).toBe("warn");
    expect(level(null, 1, 2, "max")).toBe("none");
  });
});

describe("indicadores del período", () => {
  const calves = [
    calf("a", "2026-09-01", { serum_tp: 6.5, colostrum_liters: 4, colostrum_brix: 25, colostrum_hours: 1 }),
    calf("b", "2026-09-05", { serum_tp: 5.0, colostrum_liters: 2, colostrum_hours: 5 }),
    calf("c", "2026-09-10", { active: false, exit_reason: "Muerte", exit_date: "2026-09-20", exit_cause: "Diarrea" }),
    calf("d", "2026-09-15", { active: false, exit_reason: "Muerte", exit_date: "2026-09-15" }),
    calf("e", "2026-05-01", { weaning_date: "2026-07-01", weaning_weight: 90 }),
    calf("f", "2026-09-20", { weaning_date: "2026-09-29", weaning_weight: 80 }),
  ];
  const r = computeIndicators({
    calves,
    weights: [
      { calf_id: "a", weighed_at: "2026-09-21", weight: 56 }, // 20 días: 0,8 kg/d
      { calf_id: "a", weighed_at: "2026-09-11", weight: 45 }, // pesada anterior, se ignora
      { calf_id: "b", weighed_at: "2026-09-25", weight: 52 }, // 20 días: 0,6 kg/d
      { calf_id: "b", weighed_at: "2026-09-08", weight: 41 }, // 3 días: muy temprano
    ],
    treatments: [
      { calf_id: "a", start_at: "2026-09-08T10:00:00Z", disease_group: "Diarrea", status: "Finalizado", outcome: "Recuperado", closed_at: "2026-09-11T10:00:00Z" },
      { calf_id: "a", start_at: "2026-09-15T10:00:00Z", disease_group: "Diarrea", status: "Activo", outcome: null, closed_at: null },
      { calf_id: "b", start_at: "2026-09-12T10:00:00Z", disease_group: "Respiratoria", status: "Finalizado", outcome: "Muerte", closed_at: "2026-09-14T10:00:00Z" },
    ],
    doses: [
      { status: "Aplicada", due_at: "2026-09-08T10:00:00Z" },
      { status: "Aplicada", due_at: "2026-09-09T10:00:00Z" },
      { status: "No aplicada", due_at: "2026-09-10T10:00:00Z" },
      { status: "Pendiente", due_at: "2026-09-11T10:00:00Z" },
      { status: "Cancelada", due_at: "2026-09-12T10:00:00Z" },
    ],
    from: "2026-09-01",
    to: "2026-09-30",
    now: "2026-10-01T00:00:00Z",
  });

  it("mortalidad 1–60 días separa las muertes de las primeras 24 h", () => {
    expect(r.atRisk).toBe(5); // e nació en mayo: ya no estaba en guachera
    expect(r.mortality.deaths).toBe(1);
    expect(r.mortality.deaths24h).toBe(1);
    expect(r.mortality.value).toBeCloseTo(20);
    expect(r.mortality.causes).toEqual([["Diarrea", 1], ["Sin causa registrada", 1]]);
  });
  it("morbilidad cuenta terneros, no tratamientos", () => {
    expect(r.diarrhea).toEqual({ value: 20, calves: 1 });
    expect(r.respiratory.calves).toBe(1);
    expect(r.retreated).toBe(1);
    expect(r.recovered).toEqual({ value: 50, closed: 2 });
  });
  it("ganancia diaria y terneros encaminados a duplicar el peso", () => {
    expect(r.gdp.calves).toBe(2);
    expect(r.gdp.value).toBeCloseTo(0.7);
    expect(r.gdp.doubling).toBeCloseTo(50); // 0,8 ≥ 40/60; 0,6 < 0,667
  });
  it("calostrado e inmunidad de los nacidos en el período", () => {
    expect(r.born).toBe(5);
    expect(r.tpi.measured).toBe(2);
    expect(r.tpi.share.find((s) => s.category === "Pobre")?.value).toBe(50);
    expect(r.colostrum).toEqual({ recorded: 2, ok: 50, early: 50 });
  });
  it("destete y cumplimiento de dosis", () => {
    expect(r.weaning).toEqual({ count: 1, age: 9, weight: 80 });
    expect(r.doses).toEqual({ due: 4, applied: 50, missed: 1, late: 1 });
  });
});
