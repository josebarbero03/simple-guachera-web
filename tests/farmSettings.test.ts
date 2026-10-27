import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, settingsOf, validateSettings } from "../src/lib/farmSettings";

describe("configuración del establecimiento", () => {
  it("completa con valores por defecto y ordena categorías", () => {
    expect(settingsOf(null)).toEqual(DEFAULT_SETTINGS);
    const s = settingsOf({ settings: { categories: [{ name: "Recría", minAgeDays: 71, maxAgeDays: 300 }, { name: "Guachera", minAgeDays: 0, maxAgeDays: 70 }] } });
    expect(s.categories.map((c) => c.name)).toEqual(["Guachera", "Recría"]);
    expect(s.logKinds).toEqual(DEFAULT_SETTINGS.logKinds);
    expect(s.planLateDays).toBe(14);
  });
  it("valida rangos, nombres y días de atraso", () => {
    const ok = { ...DEFAULT_SETTINGS };
    expect(validateSettings(ok)).toBeNull();
    expect(validateSettings({ ...ok, categories: [] })).toMatch(/al menos una/);
    expect(validateSettings({ ...ok, categories: [{ name: "A", minAgeDays: 0, maxAgeDays: 70 }, { name: "B", minAgeDays: 60, maxAgeDays: 90 }] })).toMatch(/superponen/);
    expect(validateSettings({ ...ok, categories: [{ name: "A", minAgeDays: 10, maxAgeDays: 5 }] })).toMatch(/hasta/);
    expect(validateSettings({ ...ok, categories: [{ name: "A", minAgeDays: 0, maxAgeDays: 5 }, { name: "a", minAgeDays: 6, maxAgeDays: 9 }] })).toMatch(/repetida/);
    expect(validateSettings({ ...ok, categories: [{ name: " ", minAgeDays: 0, maxAgeDays: 5 }] })).toMatch(/nombre/);
    expect(validateSettings({ ...ok, logKinds: [] })).toMatch(/tarea/);
    expect(validateSettings({ ...ok, planLateDays: 90 })).toMatch(/atraso/);
  });
});
