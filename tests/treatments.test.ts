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
