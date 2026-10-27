import { useCallback, useEffect, useState, type FormEvent } from "react";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { errorText, supabase } from "../lib/supabase";
import { describePlanDays, describeSchedule } from "../lib/treatments";
import type { DiseaseGroup, Farm, Protocol } from "../lib/types";

export const DISEASE_GROUPS: DiseaseGroup[] = ["Diarrea", "Respiratoria", "Ombligo", "Otra"];
import { Button, Card, Empty, Field, Input, Modal, Select, Textarea, toast } from "./ui";

export function useProtocols(farmId: string) {
  const [protocols, setProtocols] = useState<Protocol[] | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await supabase.from("simple_guachera_protocols").select("*").eq("farm_id", farmId).order("kind").order("age_day").order("name");
    if (error) { toast.error(errorText(error, "No se pudieron cargar los protocolos")); setProtocols((p) => p ?? []); return; }
    setProtocols(data as Protocol[]);
  }, [farmId]);
  useEffect(() => { void load(); }, [load]);
  return { protocols, load };
}

export function ProtocolsPanel({ farm }: { farm: Farm }) {
  const { protocols, load } = useProtocols(farm.id);
  const [editing, setEditing] = useState<{ protocol: Protocol | null } | null>(null);

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-black">Protocolos</h1><p className="text-sm text-slate-600">Tratamientos autorizados y plan sanitario por edad de {farm.name}</p></div>
      {protocols?.length ? <Button onClick={() => setEditing({ protocol: null })}><Plus />Nuevo protocolo</Button> : null}
    </div>
    {protocols === null ? <p className="py-10 text-center text-slate-500">Cargando…</p>
      : !protocols.length ? <Empty icon={<FileText />} title="Todavía no hay protocolos" text="Definí producto, dosis, vía y frecuencia para cada enfermedad, y las aplicaciones preventivas por día de vida (vacunas, vitaminas, etc.)." action={<Button onClick={() => setEditing({ protocol: null })}><Plus />Crear protocolo</Button>} />
      : <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">{protocols.map((p) => <li key={p.id} className="min-w-0">
        <Card className={`flex gap-3 ${p.active ? "" : "opacity-60"}`}>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-lg font-black"><span className="truncate">{p.name}</span>{!p.active ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">Inactivo</span> : null}</p>
            <p className="font-bold text-brand-dark">{p.product}{p.dose ? ` · ${p.dose}` : ""}{p.route ? ` · ${p.route}` : ""}</p>
            <p className="text-sm text-slate-500">{p.kind === "Plan sanitario" ? <span className="font-bold text-sky-700">Plan sanitario · {describePlanDays(p.age_day, p.age_day_to)}</span> : <><span className="font-bold">{p.disease_group}</span> · {describeSchedule(p.interval_hours, p.duration_days)}</>}{p.withdrawal_days ? ` · retiro ${p.withdrawal_days} días` : ""}</p>
            {p.notes ? <p className="mt-1 text-sm text-slate-600">{p.notes}</p> : null}
          </div>
          <button onClick={() => setEditing({ protocol: p })} className="grid size-10 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label={`Editar ${p.name}`}><Pencil className="size-4" /></button>
        </Card>
      </li>)}</ul>}
    {editing ? <ProtocolForm farmId={farm.id} protocol={editing.protocol} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} /> : null}
  </div>;
}

function ProtocolForm({ farmId, protocol, onClose, onSaved }: { farmId: string; protocol: Protocol | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({
    name: protocol?.name ?? "", product: protocol?.product ?? "", dose: protocol?.dose ?? "", route: protocol?.route ?? "",
    interval_hours: String(protocol?.interval_hours ?? 24), duration_days: String(protocol?.duration_days ?? 3),
    withdrawal_days: String(protocol?.withdrawal_days ?? 0), notes: protocol?.notes ?? "", active: protocol?.active ?? true,
    kind: protocol?.kind ?? "Tratamiento", disease_group: protocol?.disease_group ?? "Diarrea", age_day: protocol?.age_day != null ? String(protocol.age_day) : "", age_day_to: protocol?.age_day_to != null ? String(protocol.age_day_to) : "",
  });
  const isPlan = form.kind === "Plan sanitario";
  const ageDay = Number(form.age_day);
  const ageDayTo = form.age_day_to.trim() ? Number(form.age_day_to) : null;
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));
  const interval = Number(form.interval_hours), duration = Number(form.duration_days), withdrawal = Number(form.withdrawal_days);
  const valid = Number.isInteger(interval) && interval >= 1 && interval <= 720 && Number.isInteger(duration) && duration >= 1 && duration <= 60;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.product.trim()) { toast.error("Completá nombre y producto."); return; }
    if (!isPlan && !valid) { toast.error("Revisá frecuencia (1 a 720 h) y duración (1 a 60 días)."); return; }
    if (isPlan && (!form.age_day.trim() || !Number.isInteger(ageDay) || ageDay < 0 || ageDay > 365)) { toast.error("Indicá desde qué día de vida (0 a 365)."); return; }
    if (isPlan && ageDayTo !== null && (!Number.isInteger(ageDayTo) || ageDayTo < ageDay || ageDayTo > 365)) { toast.error("“Hasta el día” debe ser igual o mayor que “Desde el día” (máximo 365)."); return; }
    if (!Number.isInteger(withdrawal) || withdrawal < 0) { toast.error("El retiro debe ser 0 o más días."); return; }
    setSaving(true);
    const values = {
      name: form.name.trim(), product: form.product.trim(), dose: form.dose.trim(), route: form.route.trim(),
      interval_hours: isPlan ? 24 : interval, duration_days: isPlan ? 1 : duration, withdrawal_days: withdrawal, notes: form.notes.trim(), active: form.active,
      kind: form.kind, disease_group: isPlan ? "Preventivo" : form.disease_group, age_day: isPlan ? ageDay : null, age_day_to: isPlan && ageDayTo !== null && ageDayTo > ageDay ? ageDayTo : null,
    };
    const { error } = protocol
      ? await supabase.from("simple_guachera_protocols").update(values).eq("id", protocol.id)
      : await supabase.from("simple_guachera_protocols").insert({ ...values, farm_id: farmId });
    setSaving(false);
    if (error) { toast.error(errorText(error, "No se pudo guardar")); return; }
    toast.ok(protocol ? "Protocolo actualizado" : "Protocolo creado");
    await onSaved();
  }

  async function remove() {
    if (!protocol || !window.confirm(`¿Eliminar el protocolo "${protocol.name}"? Los tratamientos ya indicados no se borran.`)) return;
    setSaving(true);
    const { error } = await supabase.from("simple_guachera_protocols").delete().eq("id", protocol.id);
    setSaving(false);
    if (error) { toast.error(errorText(error, "No se pudo eliminar")); return; }
    toast.ok("Protocolo eliminado");
    await onSaved();
  }

  return <Modal title={protocol ? "Editar protocolo" : "Nuevo protocolo"} onClose={onClose}>
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
        {(["Tratamiento", "Plan sanitario"] as const).map((k) => <button key={k} type="button" onClick={() => set("kind", k)} className={`rounded-lg px-3 py-2 text-sm font-bold ${form.kind === k ? "bg-white text-brand-dark shadow-sm" : "text-slate-500"}`}>{k}</button>)}
      </div>
      <p className="-mt-2 text-sm text-slate-500">{isPlan ? "Se aplica una vez a cada ternero dentro del rango de días de vida indicado. Aparece solo en “Hoy” desde el primer día y queda pendiente hasta el último." : "Se indica a terneros enfermos desde “Tratamientos”."}</p>
      <Field label={isPlan ? "Nombre" : "Nombre / enfermedad"}><Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={isPlan ? "Ej. Vacuna respiratoria 1ra dosis" : "Ej. Diarrea neonatal"} autoFocus={!protocol} required /></Field>
      {isPlan ? <div className="grid grid-cols-2 gap-3">
          <Field label="Desde el día de vida" hint="0 = día del nacimiento"><Input type="number" inputMode="numeric" min={0} max={365} value={form.age_day} onChange={(e) => set("age_day", e.target.value)} placeholder="Ej. 10" required /></Field>
          <Field label="Hasta el día de vida" hint="Vacío = solo ese día"><Input type="number" inputMode="numeric" min={0} max={365} value={form.age_day_to} onChange={(e) => set("age_day_to", e.target.value)} placeholder="Ej. 20" /></Field>
        </div>
        : <Field label="Grupo" hint="Se usa para los indicadores de morbilidad"><Select value={form.disease_group} onChange={(e) => set("disease_group", e.target.value)}>{DISEASE_GROUPS.map((g) => <option key={g}>{g}</option>)}</Select></Field>}
      <Field label="Producto"><Input value={form.product} onChange={(e) => set("product", e.target.value)} placeholder="Nombre comercial o droga" required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Dosis"><Input value={form.dose} onChange={(e) => set("dose", e.target.value)} placeholder="Ej. 5 ml" /></Field>
        <Field label="Vía"><Input value={form.route} onChange={(e) => set("route", e.target.value)} placeholder="Ej. IM, SC, oral" list="routes" /></Field>
        {!isPlan ? <>
          <Field label="Cada (horas)"><Input type="number" inputMode="numeric" min={1} max={720} value={form.interval_hours} onChange={(e) => set("interval_hours", e.target.value)} required /></Field>
          <Field label="Durante (días)"><Input type="number" inputMode="numeric" min={1} max={60} value={form.duration_days} onChange={(e) => set("duration_days", e.target.value)} required /></Field>
        </> : null}
        <Field label="Retiro (días)"><Input type="number" inputMode="numeric" min={0} value={form.withdrawal_days} onChange={(e) => set("withdrawal_days", e.target.value)} /></Field>
        {!isPlan ? <div className="flex items-end pb-2.5"><p className="text-sm font-bold text-brand-dark">{valid ? describeSchedule(interval, duration) : "—"}</p></div> : null}
      </div>
      <datalist id="routes">{["Intramuscular (IM)", "Subcutánea (SC)", "Endovenosa (EV)", "Oral", "Tópica"].map((r) => <option key={r} value={r} />)}</datalist>
      <Field label="Indicaciones" hint="Opcional: lo que el operario debe tener en cuenta"><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} /></Field>
      {protocol ? <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} className="size-4 accent-[#0f6b50]" />Activo (disponible para nuevos tratamientos)</label> : null}
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
        {protocol ? <Button type="button" variant="danger" onClick={() => void remove()} disabled={saving}><Trash2 />Eliminar</Button> : <span />}
        <div className="flex flex-col-reverse gap-2 sm:flex-row"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" loading={saving}>Guardar</Button></div>
      </div>
    </form>
  </Modal>;
}
