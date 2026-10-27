import { useCallback, useEffect, useState } from "react";
import { addDays, today } from "../lib/calves";
import { settingsOf } from "../lib/farmSettings";
import { SEVERITY_ORDER } from "../lib/indicators";
import { errorText, supabase } from "../lib/supabase";
import { dayBounds } from "../lib/treatments";
import type { Calf, Dose, Farm, PlanApplication, Protocol, Treatment } from "../lib/types";
import { toast } from "../components/ui";

export type DoseRow = Dose & {
  calf: { tag: string; location: string } | null;
  treatment: Pick<Treatment, "protocol_name" | "product" | "dose" | "route" | "diagnosis" | "severity" | "notes"> | null;
};
export type PlanItem = { calf: Pick<Calf, "id" | "tag" | "location" | "birth_date">; protocol: Protocol; due: string; until: string };
export type PlanDone = PlanApplication & { calf: { tag: string } | null; protocol: { name: string; product: string } | null };
export type Skipping = { kind: "dose"; dose: DoseRow } | { kind: "plan"; item: PlanItem };

const SELECT = "*, calf:simple_guachera_calves(tag,location), treatment:simple_guachera_treatments(protocol_name,product,dose,route,diagnosis,severity,notes)";

/** Tareas sanitarias del día (dosis de tratamientos y plan sanitario) y cómo registrarlas. */
export function useDayTasks(farm: Farm) {
  const [pending, setPending] = useState<DoseRow[] | null>(null);
  const [done, setDone] = useState<DoseRow[]>([]);
  const [plan, setPlan] = useState<PlanItem[]>([]);
  const [planDone, setPlanDone] = useState<PlanDone[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const day = today();
  // Días que una aplicación del plan sigue apareciendo como atrasada después del último día del rango.
  const PLAN_WINDOW = settingsOf(farm).planLateDays;
  const { start, end } = dayBounds(day);

  const load = useCallback(async () => {
    setRefreshing(true);
    const [p, d, protocols, todayApps] = await Promise.all([
      supabase.from("simple_guachera_doses").select(SELECT).eq("farm_id", farm.id).eq("status", "Pendiente").lte("due_at", end).order("due_at"),
      supabase.from("simple_guachera_doses").select(SELECT).eq("farm_id", farm.id).in("status", ["Aplicada", "No aplicada"]).gte("done_at", start).order("done_at", { ascending: false }),
      supabase.from("simple_guachera_protocols").select("*").eq("farm_id", farm.id).eq("kind", "Plan sanitario").eq("active", true),
      supabase.from("simple_guachera_plan_applications").select("*, calf:simple_guachera_calves(tag), protocol:simple_guachera_protocols(name,product)").eq("farm_id", farm.id).gte("done_at", start).order("done_at", { ascending: false }),
    ]);
    const error = p.error ?? d.error ?? protocols.error ?? todayApps.error;
    if (error) { setRefreshing(false); toast.error(errorText(error, "No se pudieron cargar las tareas del día")); setPending((x) => x ?? []); return; }

    // Plan sanitario: terneros activos que cumplen (o cumplieron hace poco) el día de vida de cada aplicación.
    const plans = (protocols.data as Protocol[]).filter((x) => x.age_day != null);
    let items: PlanItem[] = [];
    if (plans.length) {
      const oldest = addDays(day, -(Math.max(...plans.map((x) => x.age_day_to ?? x.age_day!)) + PLAN_WINDOW));
      const calves = await supabase.from("simple_guachera_calves").select("id,tag,location,birth_date").eq("farm_id", farm.id).eq("active", true).gte("birth_date", oldest);
      const ids = (calves.data ?? []).map((c) => c.id);
      const apps = ids.length ? await supabase.from("simple_guachera_plan_applications").select("calf_id,protocol_id").in("calf_id", ids) : { data: [] };
      const doneKeys = new Set((apps.data ?? []).map((a) => `${a.calf_id}|${a.protocol_id}`));
      items = (calves.data ?? []).flatMap((c) => plans.map((pr) => ({ calf: c, protocol: pr, due: addDays(c.birth_date, pr.age_day!), until: addDays(c.birth_date, pr.age_day_to ?? pr.age_day!) })))
        .filter((i) => i.due <= day && i.until >= addDays(day, -PLAN_WINDOW) && !doneKeys.has(`${i.calf.id}|${i.protocol.id}`))
        .sort((a, b) => a.due.localeCompare(b.due) || a.calf.tag.localeCompare(b.calf.tag));
    }
    setRefreshing(false);
    const sev = (r: DoseRow) => SEVERITY_ORDER[r.treatment?.severity ?? "Leve"];
    setPending((p.data as DoseRow[]).sort((a, b) => sev(a) - sev(b) || a.due_at.localeCompare(b.due_at)));
    setDone(d.data as DoseRow[]);
    setPlan(items);
    setPlanDone(todayApps.data as PlanDone[]);
  }, [farm.id, start, end, day, PLAN_WINDOW]);

  useEffect(() => { void load(); }, [load]);
  async function recordDose(dose: DoseRow, status: "Aplicada" | "No aplicada" | "Pendiente", notes = "") {
    setBusy(dose.id);
    const { error } = await supabase.rpc("simple_guachera_record_dose", { dose: dose.id, new_status: status, dose_notes: notes });
    setBusy(null);
    if (error) { toast.error(errorText(error, "No se pudo registrar")); return; }
    toast.ok(status === "Aplicada" ? `Dosis aplicada a ${dose.calf?.tag ?? "ternero"}` : status === "No aplicada" ? "Registrado como no aplicada" : "Vuelta a pendiente");
    await load();
  }

  async function recordPlan(calfId: string, protocolId: string, tag: string, status: "Aplicada" | "No aplicada" | "Pendiente", notes = "") {
    const key = `${calfId}|${protocolId}`;
    setBusy(key);
    const { error } = await supabase.rpc("simple_guachera_record_plan", { calf: calfId, protocol: protocolId, new_status: status, plan_notes: notes });
    setBusy(null);
    if (error) { toast.error(errorText(error, "No se pudo registrar")); return; }
    toast.ok(status === "Aplicada" ? `Plan sanitario aplicado a ${tag}` : status === "No aplicada" ? "Registrado como no aplicada" : "Vuelta a pendiente");
    await load();
  }

  return { day, start, pending, done, plan, planDone, refreshing, busy, load, recordDose, recordPlan };
}
