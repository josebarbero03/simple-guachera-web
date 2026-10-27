import { useCallback, useEffect, useState } from "react";
import { Baby, Check, X } from "lucide-react";
import { formatDate, today } from "../lib/calves";
import { errorText, supabase } from "../lib/supabase";
import { formatDateTime } from "../lib/treatments";
import type { Birth, Farm } from "../lib/types";
import { Button, Field, Input, Select, toast } from "./ui";

/** Nacimientos avisados por el equipo, para revisar y cargar como terneros. */
export function PendingBirths({ farm, onLoaded }: { farm: Farm; onLoaded: () => Promise<void> }) {
  const [births, setBirths] = useState<Birth[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase.from("simple_guachera_births").select("*").eq("farm_id", farm.id).eq("status", "Pendiente").order("birth_date").order("created_at");
    setBirths((data ?? []) as Birth[]);
  }, [farm.id]);
  useEffect(() => { void load(); }, [load]);

  if (!births.length) return null;
  return <section className="space-y-2 rounded-2xl border-2 border-sky-300 bg-sky-50 p-3 sm:p-4">
    <p className="flex items-center gap-2 font-black text-sky-900"><Baby className="size-5" />Nacimientos avisados por el equipo ({births.length})</p>
    <p className="text-sm text-sky-900/80">Revisá los datos, completá lo que falte y cargalos como terneros.</p>
    <ul className="space-y-2">{births.map((b) => <BirthItem key={b.id} birth={b} onDone={async () => { await load(); await onLoaded(); }} />)}</ul>
  </section>;
}

function BirthItem({ birth: b, onDone }: { birth: Birth; onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [tag, setTag] = useState(b.tag);
  const [sex, setSex] = useState(b.sex ?? "Hembra");
  const [date, setDate] = useState(b.birth_date);
  const [weight, setWeight] = useState(b.birth_weight != null ? String(b.birth_weight).replace(".", ",") : "");
  const [location, setLocation] = useState("");
  const [liters, setLiters] = useState(b.colostrum_liters != null ? String(b.colostrum_liters).replace(".", ",") : "");
  const [hours, setHours] = useState(b.colostrum_hours != null ? String(b.colostrum_hours).replace(".", ",") : "");
  const [alive, setAlive] = useState(b.alive);
  const [saving, setSaving] = useState(false);
  const num = (v: string) => (v.trim() ? Number(v.replace(",", ".")) : null);

  async function accept() {
    if (!tag.trim()) { toast.error("Poné la caravana para cargarlo."); return; }
    const kg = num(weight), l = num(liters), h = num(hours);
    if ([kg, l, h].some((x) => x !== null && !Number.isFinite(x))) { toast.error("Revisá los números."); return; }
    setSaving(true);
    const { error } = await supabase.rpc("simple_guachera_accept_birth", { birth: b.id, calf_tag: tag.trim(), calf_sex: sex, calf_birth_date: date, calf_birth_weight: kg, calf_location: location.trim(), calf_colostrum_liters: alive ? l : null, calf_colostrum_hours: alive ? h : null, calf_alive: alive });
    setSaving(false);
    if (error) { toast.error(errorText(error, "No se pudo cargar")); return; }
    toast.ok(alive ? `Ternero ${tag.trim()} cargado` : `Registrado: ${tag.trim()} nacido muerto`);
    await onDone();
  }
  async function discard() {
    if (!window.confirm("¿Descartar este aviso de nacimiento? (por ejemplo, si estaba repetido)")) return;
    const { error } = await supabase.rpc("simple_guachera_discard_birth", { birth: b.id });
    if (error) { toast.error(errorText(error, "No se pudo descartar")); return; }
    await onDone();
  }

  return <li className="rounded-xl bg-white p-3">
    <button onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-3 text-left">
      <div className="min-w-0 flex-1">
        <p className="font-black">{b.tag ? `Caravana ${b.tag}` : "Sin caravana"} · {b.sex ?? "sexo sin indicar"}{!b.alive ? <span className="ml-2 rounded-full bg-rose-600 px-2 py-0.5 text-xs text-white">Nació muerto</span> : null}</p>
        <p className="text-sm text-slate-600">Nació {formatDate(b.birth_date)} · parto {b.calving.toLowerCase()}{b.mother_tag ? ` · madre ${b.mother_tag}` : ""}{b.colostrum_liters ? ` · ${String(b.colostrum_liters).replace(".", ",")} L de calostro` : b.alive ? " · sin calostro registrado" : ""}</p>
        {b.notes ? <p className="text-sm text-slate-700">{b.notes}</p> : null}
        <p className="text-xs text-slate-400">Avisó {b.author_name || "el equipo"} · {formatDateTime(b.created_at)}</p>
      </div>
      <span className="shrink-0 text-sm font-bold text-brand">{open ? "Cerrar" : "Revisar"}</span>
    </button>
    {open ? <div className="mt-3 space-y-3 border-t border-[#edf2f0] pt-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Caravana"><Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Obligatoria" /></Field>
        <Field label="Sexo"><Select value={sex} onChange={(e) => setSex(e.target.value as "Hembra" | "Macho")}><option>Hembra</option><option>Macho</option></Select></Field>
        <Field label="Fecha de nacimiento"><Input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Peso al nacer (kg)"><Input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} /></Field>
        <Field label="Estado"><Select value={alive ? "vivo" : "muerto"} onChange={(e) => setAlive(e.target.value === "vivo")}><option value="vivo">Vivo</option><option value="muerto">Nacido muerto</option></Select></Field>
        <Field label="Ubicación"><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Estaca / sector" /></Field>
        {alive ? <>
          <Field label="Calostro (litros)"><Input inputMode="decimal" value={liters} onChange={(e) => setLiters(e.target.value)} /></Field>
          <Field label="Horas de vida al tomarlo"><Input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
        </> : null}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button variant="danger" onClick={() => void discard()} disabled={saving}><X />Descartar</Button>
        <Button onClick={() => void accept()} loading={saving}>{!saving ? <Check /> : null}{alive ? "Cargar ternero" : "Registrar nacido muerto"}</Button>
      </div>
    </div> : null}
  </li>;
}
