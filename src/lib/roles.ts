import type { Role } from "./types";

export const ROLE_LABEL: Record<Role, string> = {
  propietario: "Productor (dueño)",
  productor: "Productor",
  veterinario: "Veterinario",
  operario: "Operario",
};

export const INVITABLE_ROLES = ["operario", "veterinario", "productor"] as const;

// Productor y veterinario tienen todas las funciones; el operario solo lo del día.
export function isManager(role: Role | null | undefined) {
  return role === "propietario" || role === "productor" || role === "veterinario";
}
