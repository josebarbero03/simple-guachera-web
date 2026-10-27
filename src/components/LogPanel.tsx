import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ClipboardList, Plus, Trash2 } from "lucide-react";
import { formatDate, today } from "../lib/calves";
import { errorText, supabase } from "../lib/supabase";
import { dayBounds, formatTime } from "../lib/treatments";
import type { DailyLog, Farm } from "../lib/types";
import { Button, Card, Empty, Field, Input, Textarea, toast } from "./ui";

import { settingsOf } from "../lib/farmSettings";

type LogRow = DailyLog & { calf: { tag: string } | null };

export function LogPanel({ farm, userId, manager }: { farm: Farm; userId: string; manager: boolean }) {
  const [day, setDay] = useState(today());
  const [logs, setLogs] = useState<LogRow[] | null>(null);
  const [tags, setTags] = useState<{ id: string; tag: string }[]>([]);
  const kinds = settingsOf(farm).logKinds;
  const [kind, setKind] = useState(kinds[0]);
  const [tag, setTag] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { start, end } = dayBounds(day);
    const { data, error } = await supabase.from("simple_guachera_daily_logs").select("*, calf:simple_guachera_calves(tag)").eq("farm_id", farm.id).gte("done_at", start).lte("done_at", end).order("done_at", { ascending: false });
    if (error) { toast.error(errorText(error, "No se pudo cargar el registro")); setLogs((l) => l ?? []); return; }
    setLogs(data as LogRow[]);
  }, [farm.id, day]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void supabase.from("simple_guachera_calves").select("id,tag").eq("farm_id", farm.id).eq("active", true).order("tag").then(({ data }) => setTags((data ?? []) as { id: string; tag: string }[]));
  }, [farm.id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const calf = tag.trim() ? tags.find((t) => t.tag.toLowerCase() === tag.trim().toLowerCase()) : null;
    if (tag.trim() && !calf) { toast.error(`No hay un ternero activo con caravana ${tag.trim()}.`); return; }
    if (kind === "Otro" && !notes.trim()) { toast.error("Describí la tarea en el detalle."); return; }
    setSaving(true);
    const { error } = await supabase.from("simple_guachera_daily_logs").insert({ farm_id: farm.id, kind, notes: notes.trim(), calf_id: calf?.id ?? null });
    setSaving(false);
    if (error) { toast.error(errorText(error, "No se pudo guardar")); return; }
    toast.ok("Tarea registrada");
    setNotes(""); setTag("");
    if (day !== today()) setDay(today()); else await load();
  }

  async function remove(log: LogRow) {
    if (!window.confirm(`¿Borrar el registro "${log.kind}"?`)) return;
    const { error } = await supabase.from("simple_guachera_daily_logs").delete().eq("id", log.id);
    if (error) { toast.error(errorText(error, "No se pudo borrar")); return; }
    await load();
  }

  return <div className="space-y-4">
    <div><h1 className="text-2xl font-black">Registro diario</h1><p className="text-sm text-slate-600">Tareas realizadas en {farm.name}</p></div>

    <Card>
      <form onSubmit={submit} className="space-y-4">
        <div><p className="text-sm font-semibold text-slate-700">¿Qué se hizo?</p>
          <div className="mt-2 flex flex-wrap gap-2">{kinds.map((k) => <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-full px-3 py-2 text-sm font-bold ${kind === k ? "bg-brand text-white" : "bg-slate-100 text-slate-700"}`}>{k}</button>)}</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
          <Field label="Ternero" hint="Opcional: dejar vacío si es para todos"><Input list="log-tags" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Caravana" /></Field>
          <Field label="Detalle"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Ej. 4 L de leche turno mañana" /></Field>
        </div>
        <datalist id="log-tags">{tags.map((t) => <option key={t.id} value={t.tag} />)}</datalist>
        <Button type="submit" className="w-full sm:w-auto" loading={saving}>{!saving ? <Plus /> : null}Registrar tarea</Button>
      </form>
    </Card>

    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-black">{day === today() ? "Hoy" : formatDate(day)}</h2>
      <Input type="date" max={today()} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="!mt-0 w-auto" aria-label="Fecha" />
    </div>

    {logs === null ? <p className="py-6 text-center text-slate-500">Cargando…</p>
      : !logs.length ? <Empty icon={<ClipboardList />} title="Sin tareas registradas" text="Las tareas que se carguen ese día aparecen acá." />
      : <ul className="space-y-2">{logs.map((log) => <li key={log.id} className="flex items-start gap-3 rounded-2xl border border-[#dce5e1] bg-white p-3">
        <span className="w-12 shrink-0 pt-0.5 text-sm font-black text-brand-dark">{formatTime(log.done_at)}</span>
        <div className="min-w-0 flex-1">
          <p className="font-black">{log.kind}{log.calf ? <span className="font-semibold text-slate-500"> · {log.calf.tag}</span> : null}</p>
          {log.notes ? <p className="whitespace-pre-line text-sm text-slate-700">{log.notes}</p> : null}
          <p className="text-xs text-slate-400">{log.author_name}</p>
        </div>
        {manager || log.created_by === userId ? <button onClick={() => void remove(log)} className="grid size-9 shrink-0 place-items-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Borrar"><Trash2 className="size-4" /></button> : null}
      </li>)}</ul>}
  </div>;
}
