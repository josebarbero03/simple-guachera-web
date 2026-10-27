import { useMemo, useState, type FormEvent } from "react";
import { CheckSquare, Search, Square } from "lucide-react";
import { CATEGORY_NAMES, effectiveCategory, today } from "../lib/calves";
import { errorText, supabase } from "../lib/supabase";
import type { Calf } from "../lib/types";
import { Button, Field, Input, Modal, Select, Textarea, toast } from "./ui";

const AUTO = "__auto__";

/** Pasa uno o varios terneros activos a otra categoría (o los vuelve a la automática por edad). */
export function ChangeCategoryModal({ calves, preselected = [], onClose, onSaved }: { calves: Calf[]; preselected?: string[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const active = useMemo(() => calves.filter((c) => c.active).sort((a, b) => a.tag.localeCompare(b.tag)), [calves]);
  const [selected, setSelected] = useState<Set<string>>(new Set(preselected));
  const [from, setFrom] = useState("todas");
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState(CATEGORY_NAMES[1]);
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const single = preselected.length === 1 && active.length === 1;

  const visible = active.filter((c) => (from === "todas" || effectiveCategory(c).name === from) && (!query.trim() || c.tag.toLowerCase().includes(query.trim().toLowerCase())));
  const allVisible = visible.length > 0 && visible.every((c) => selected.has(c.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected.size) { toast.error("Elegí al menos un ternero."); return; }
    setSaving(true);
    const { data, error } = await supabase.rpc("simple_guachera_change_category", { calf_ids: [...selected], new_category: target === AUTO ? "" : target, moved_on: date, move_notes: notes.trim() });
    setSaving(false);
    if (error) { toast.error(errorText(error, "No se pudo cambiar la categoría")); return; }
    toast.ok(data === 0 ? "Ya estaban en esa categoría" : data === 1 ? "Categoría cambiada" : `${data} terneros cambiados de categoría`);
    await onSaved();
  }

  return <Modal title="Cambiar categoría" onClose={onClose}>
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nueva categoría"><Select value={target} onChange={(e) => setTarget(e.target.value)}>
          {CATEGORY_NAMES.map((c) => <option key={c} value={c}>{c}</option>)}
          <option value={AUTO}>Automática (según la edad)</option>
        </Select></Field>
        <Field label="Fecha del cambio"><Input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
      </div>
      {!single ? <div>
        <div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-700">Terneros <span className="text-brand">({selected.size} elegidos)</span></p>
          <button type="button" className="text-sm font-bold text-brand" onClick={() => setSelected((s) => { const n = new Set(s); visible.forEach((c) => (allVisible ? n.delete(c.id) : n.add(c.id))); return n; })}>{allVisible ? "Quitar visibles" : "Elegir visibles"}</button></div>
        <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-2">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Caravana" className="!mt-0 pl-9" aria-label="Buscar caravana" /></div>
          <Select value={from} onChange={(e) => setFrom(e.target.value)} className="!mt-0 w-auto" aria-label="Filtrar por categoría actual"><option value="todas">Todas</option>{CATEGORY_NAMES.map((c) => <option key={c}>{c}</option>)}<option>Fuera de recría</option></Select>
        </div>
        <ul className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-[#dce5e1]">
          {!visible.length ? <li className="p-3 text-sm text-slate-500">Ningún ternero coincide.</li> : visible.map((c) => { const cat = effectiveCategory(c); return <li key={c.id}>
            <button type="button" onClick={() => toggle(c.id)} className="flex w-full items-center gap-3 border-b border-[#edf2f0] px-3 py-2.5 text-left last:border-0 hover:bg-slate-50">
              {selected.has(c.id) ? <CheckSquare className="size-5 text-brand" /> : <Square className="size-5 text-slate-300" />}
              <span className="font-bold">{c.tag}</span><span className="truncate text-sm text-slate-500">{cat.name}{cat.manual ? "" : " (por edad)"}</span>
            </button>
          </li>; })}
        </ul>
      </div> : null}
      <Field label="Observaciones" hint="Opcional, ej. destete del lote"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" loading={saving}>Cambiar categoría</Button></div>
    </form>
  </Modal>;
}
