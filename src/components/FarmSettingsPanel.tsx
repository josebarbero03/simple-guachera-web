import { useState, type FormEvent } from "react";
import { Plus, RotateCcw, Settings2, Trash2, X } from "lucide-react";
import { DEFAULT_SETTINGS, settingsOf, validateSettings, type CategoryDef } from "../lib/farmSettings";
import { errorText, supabase } from "../lib/supabase";
import type { Farm } from "../lib/types";
import { Button, Card, Input, toast } from "./ui";

type Row = { name: string; min: string; max: string };
const toRows = (cats: CategoryDef[]): Row[] => cats.map((c) => ({ name: c.name, min: String(c.minAgeDays), max: String(c.maxAgeDays) }));

/** Configuración propia del establecimiento: categorías por edad, tipos de tareas y atraso del plan sanitario. */
export function FarmSettingsPanel({ farm, firstTime, onSaved }: { farm: Farm; firstTime?: boolean; onSaved: () => Promise<void> }) {
  const current = settingsOf(farm);
  const [rows, setRows] = useState<Row[]>(toRows(current.categories));
  const [kinds, setKinds] = useState<string[]>(current.logKinds);
  const [newKind, setNewKind] = useState("");
  const [lateDays, setLateDays] = useState(String(current.planLateDays));
  const [saving, setSaving] = useState(false);

  const setRow = (i: number, key: keyof Row, value: string) => setRows((r) => r.map((row, j) => (j === i ? { ...row, [key]: value } : row)));
  function addRow() {
    const last = rows.at(-1);
    const start = last && last.max.trim() ? Number(last.max) + 1 : 0;
    setRows((r) => [...r, { name: "", min: String(start), max: String(start + 60) }]);
  }
  function addKind() {
    const k = newKind.trim();
    if (!k) return;
    if (kinds.some((x) => x.toLowerCase() === k.toLowerCase())) { toast.error("Ese tipo de tarea ya está."); return; }
    setKinds((list) => [...list, k]);
    setNewKind("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const settings = {
      categories: rows.map((r) => ({ name: r.name.trim(), minAgeDays: Number(r.min), maxAgeDays: Number(r.max) })).sort((a, b) => a.minAgeDays - b.minAgeDays),
      logKinds: kinds.map((k) => k.trim()).filter(Boolean),
      planLateDays: Number(lateDays),
    };
    const problem = validateSettings(settings);
    if (problem) { toast.error(problem); return; }
    setSaving(true);
    const { error } = await supabase.rpc("simple_guachera_update_farm_settings", { target_farm: farm.id, new_settings: settings });
    setSaving(false);
    if (error) { toast.error(errorText(error, "No se pudo guardar la configuración")); return; }
    toast.ok("Configuración guardada");
    await onSaved();
  }

  return <form onSubmit={submit} className="space-y-4">
    <div>
      <h1 className="flex items-center gap-2 text-2xl font-black"><Settings2 className="size-6 text-brand" />{firstTime ? `Configurá ${farm.name}` : "Configuración"}</h1>
      <p className="text-sm text-slate-600">{firstTime ? "Armalo a tu criterio. Podés cambiarlo cuando quieras desde Más → Configuración." : `Cómo trabaja ${farm.name}. Afecta a todo el equipo.`}</p>
    </div>

    <Card className="space-y-3">
      <div><p className="font-black">Categorías por edad</p><p className="text-sm text-slate-500">Cada ternero toma automáticamente la categoría según sus días de vida, salvo que se le asigne otra a mano.</p></div>
      <div className="grid grid-cols-[1fr_72px_72px_40px] items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><span>Nombre</span><span>Desde día</span><span>Hasta día</span><span /></div>
      {rows.map((r, i) => <div key={i} className="grid grid-cols-[1fr_72px_72px_40px] items-center gap-2">
        <Input value={r.name} onChange={(e) => setRow(i, "name", e.target.value)} placeholder="Ej. Pre-destete" className="!mt-0" aria-label={`Nombre de la categoría ${i + 1}`} />
        <Input type="number" inputMode="numeric" min={0} value={r.min} onChange={(e) => setRow(i, "min", e.target.value)} className="!mt-0 px-2" aria-label={`Desde día, categoría ${i + 1}`} />
        <Input type="number" inputMode="numeric" min={0} value={r.max} onChange={(e) => setRow(i, "max", e.target.value)} className="!mt-0 px-2" aria-label={`Hasta día, categoría ${i + 1}`} />
        <button type="button" onClick={() => setRows((list) => list.filter((_, j) => j !== i))} disabled={rows.length === 1} className="grid size-10 place-items-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30" aria-label={`Quitar categoría ${r.name || i + 1}`}><Trash2 className="size-4" /></button>
      </div>)}
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <button type="button" onClick={addRow} className="inline-flex items-center gap-1.5 text-sm font-bold text-brand"><Plus className="size-4" />Agregar categoría</button>
        <button type="button" onClick={() => setRows(toRows(DEFAULT_SETTINGS.categories))} className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500"><RotateCcw className="size-4" />Volver a las de SInPLe</button>
      </div>
      <p className="text-xs text-slate-500">Si cambiás el nombre de una categoría, los terneros que la tenían asignada a mano conservan el nombre anterior hasta que los cambies.</p>
    </Card>

    <Card className="space-y-3">
      <div><p className="font-black">Tareas del registro diario</p><p className="text-sm text-slate-500">Los botones que ve el equipo al registrar lo que hizo.</p></div>
      <div className="flex flex-wrap gap-2">{kinds.map((k) => <span key={k} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1.5 pl-3 pr-1.5 text-sm font-bold text-slate-700">{k}<button type="button" onClick={() => setKinds((list) => list.filter((x) => x !== k))} className="grid size-6 place-items-center rounded-full hover:bg-slate-200" aria-label={`Quitar ${k}`}><X className="size-3.5" /></button></span>)}</div>
      <div className="flex gap-2"><Input value={newKind} onChange={(e) => setNewKind(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKind(); } }} placeholder="Ej. Desinfección de ombligo" className="!mt-0" aria-label="Nuevo tipo de tarea" /><Button type="button" variant="secondary" onClick={addKind}><Plus />Agregar</Button></div>
    </Card>

    <Card className="space-y-2">
      <p className="font-black">Plan sanitario</p>
      <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">Si no se aplicó, seguir mostrándolo como atrasado durante
        <Input type="number" inputMode="numeric" min={0} max={60} value={lateDays} onChange={(e) => setLateDays(e.target.value)} className="!mt-0 !w-20" aria-label="Días de atraso" />días.</label>
    </Card>

    <div className="flex justify-end"><Button type="submit" loading={saving} className="w-full sm:w-auto">{firstTime ? "Guardar y empezar" : "Guardar configuración"}</Button></div>
  </form>;
}
