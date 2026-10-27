import { describe, expect, it } from "vitest";
import { ageDays, categoryFor, formatAge, formatDate, formatKg, validateCalf } from "../src/lib/calves";

describe("edad y categoría", () => {
  it("calcula días de vida", () => {
    expect(ageDays("2026-10-01", "2026-10-27")).toBe(26);
    expect(ageDays("2026-10-27", "2026-10-27")).toBe(0);
  });
  it("asigna la categoría por rango de días", () => {
    expect(categoryFor(0)).toBe("Guachera");
    expect(categoryFor(63)).toBe("Guachera");
    expect(categoryFor(64)).toBe("Acostumbramiento");
    expect(categoryFor(151)).toBe("Recría");
    expect(categoryFor(301)).toBe("Fuera de rango");
    expect(categoryFor(66, [{ name: "Guachera", minAgeDays: 0, maxAgeDays: 70 }])).toBe("Guachera");
    expect(categoryFor(-1)).toBe("Sin nacer");
  });
  it("formatea edad y fecha", () => {
    expect(formatAge(1)).toBe("1 día");
    expect(formatAge(30)).toBe("30 días · 4 sem");
    expect(formatDate("2026-03-09")).toBe("09/03/2026");
    expect(formatKg(39.5)).toBe("39,5 kg");
  });
});

describe("validación de ternero", () => {
  const on = "2026-10-27";
  it("acepta un alta válida", () => expect(validateCalf({ tag: "2418", birth_date: "2026-10-20", birth_weight: 38 }, on)).toBeNull());
  it("acepta peso vacío", () => expect(validateCalf({ tag: "2418", birth_date: "2026-10-20", birth_weight: null }, on)).toBeNull());
  it("exige caravana", () => expect(validateCalf({ tag: " ", birth_date: "2026-10-20", birth_weight: 38 }, on)).toMatch(/caravana/));
  it("rechaza fecha futura", () => expect(validateCalf({ tag: "1", birth_date: "2026-10-28", birth_weight: 38 }, on)).toMatch(/futura/));
  it("rechaza peso inválido", () => expect(validateCalf({ tag: "1", birth_date: "2026-10-20", birth_weight: NaN }, on)).toMatch(/peso/));
});
