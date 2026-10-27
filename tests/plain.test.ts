import { describe, expect, it } from "vitest";
import { isUrgent, plainInstruction, plainRoute, symptomsText, turnoFor } from "../src/lib/plain";

describe("lenguaje simple", () => {
  it("traduce la vía de aplicación", () => {
    expect(plainRoute("IM")).toBe("Inyección en el músculo");
    expect(plainRoute("Intramuscular (IM)")).toBe("Inyección en el músculo");
    expect(plainRoute("sc")).toBe("Inyección bajo la piel");
    expect(plainRoute("Subcutánea (SC)")).toBe("Inyección bajo la piel");
    expect(plainRoute("EV")).toBe("Inyección en la vena");
    expect(plainRoute("Oral")).toBe("Por la boca");
    expect(plainRoute("Tópica")).toBe("Sobre la piel");
    expect(plainRoute("Según indicación")).toBe("");
    expect(plainRoute("Rectal")).toBe("Rectal");
  });
  it("arma la instrucción sin textos vacíos ni 'según indicación'", () => {
    expect(plainInstruction("Producto X", "5 ml", "IM")).toBe("Producto X · 5 ml · Inyección en el músculo");
    expect(plainInstruction("Suero", "Según indicación veterinaria", "Oral")).toBe("Suero · Por la boca");
  });
  it("turno según la hora de Argentina", () => {
    expect(turnoFor(new Date("2026-10-27T10:00:00Z"))).toBe("mañana"); // 07:00
    expect(turnoFor(new Date("2026-10-27T19:00:00Z"))).toBe("tarde"); // 16:00
    expect(turnoFor(new Date("2026-10-28T01:00:00Z"))).toBe("noche"); // 22:00
  });
  it("síntomas y urgencia automática", () => {
    expect(symptomsText(["diarrea", "notoma", "otro"])).toBe("Diarrea, No toma la leche");
    expect(isUrgent(["diarrea"])).toBe(false);
    expect(isUrgent(["diarrea", "caido"])).toBe(true);
  });
});
