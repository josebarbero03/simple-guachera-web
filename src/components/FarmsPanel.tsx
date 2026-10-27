import { useState, type FormEvent } from "react";
import { Building2, ChevronRight, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { errorText, supabase } from "../lib/supabase";
import { ROLE_LABEL } from "../lib/roles";
import type { Farm, Role } from "../lib/types";
import { Button, Card, Empty, Field, Input, Modal, toast } from "./ui";

type Editing = { farm: Farm | null };

export function FarmsPanel({ farms, roles, userId, email, onChanged, onOpen }: { farms: Farm[]; roles: Record<string, Role>; userId: string; email: string; onChanged: () => Promise<void>; onOpen: (id: string) => void }) {
  const [editing, setEditing] = useState<Editing | null>(null);

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-black">Establecimientos</h1><p className="text-sm text-slate-600">Cada establecimiento tiene sus propios terneros.</p></div>
      {farms.length ? <Button onClick={() => setEditing({ farm: null })}><Plus />Nuevo establecimiento</Button> : null}
    </div>

    {!farms.length ? <Empty icon={<Building2 />} title="Todavía no hay establecimientos" text={`Creá el primero para empezar a cargar terneros. Si trabajás en un establecimiento de otra persona, pedile que te sume desde “Equipo” con tu email ${email}.`} action={<Button onClick={() => setEditing({ farm: null })}><Plus />Crear establecimiento</Button>} />
      : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {farms.map((farm) => {
          const owner = farm.owner_id === userId;
          return <Card key={farm.id} className="flex items-center gap-3">
            <button onClick={() => onOpen(farm.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><Building2 className="size-5" /></span>
              <span className="min-w-0"><span className="block truncate font-black">{farm.name}</span><span className="flex items-center gap-1 truncate text-sm text-slate-500"><MapPin className="size-3.5 shrink-0" />{farm.location || "Sin ubicación"}</span>{roles[farm.id] ? <span className="text-xs font-bold text-brand">{ROLE_LABEL[roles[farm.id]]}</span> : null}</span>
            </button>
            {owner ? <button onClick={() => setEditing({ farm })} className="grid size-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label={`Editar ${farm.name}`}><Pencil className="size-4" /></button> : null}
            <ChevronRight className="size-5 text-slate-300" />
          </Card>;
        })}
      </div>}

    {editing ? <FarmForm farm={editing.farm} onClose={() => setEditing(null)} onSaved={async (id) => { setEditing(null); await onChanged(); if (id) onOpen(id); }} /> : null}
  </div>;
}

function FarmForm({ farm, onClose, onSaved }: { farm: Farm | null; onClose: () => void; onSaved: (newId?: string) => Promise<void> }) {
  const [name, setName] = useState(farm?.name ?? "");
  const [location, setLocation] = useState(farm?.location ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) { toast.error("El nombre es obligatorio."); return; }
    setSaving(true);
    const values = { name: name.trim(), location: location.trim() };
    const result = farm
      ? await supabase.from("simple_guachera_farms").update(values).eq("id", farm.id).select("id").single()
      : await supabase.from("simple_guachera_farms").insert(values).select("id").single();
    setSaving(false);
    if (result.error) { toast.error(errorText(result.error, "No se pudo guardar")); return; }
    toast.ok(farm ? "Establecimiento actualizado" : "Establecimiento creado");
    await onSaved(farm ? undefined : result.data.id);
  }

  async function remove() {
    if (!farm || !window.confirm(`¿Eliminar "${farm.name}" y todos sus terneros? Esta acción no se puede deshacer.`)) return;
    setSaving(true);
    const { error } = await supabase.from("simple_guachera_farms").delete().eq("id", farm.id);
    setSaving(false);
    if (error) { toast.error(errorText(error, "No se pudo eliminar")); return; }
    toast.ok("Establecimiento eliminado");
    await onSaved();
  }

  return <Modal title={farm ? "Editar establecimiento" : "Nuevo establecimiento"} onClose={onClose}>
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nombre"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Campo Norte" autoFocus required /></Field>
      <Field label="Ubicación" hint="Opcional"><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ej. La Laguna, Córdoba" /></Field>
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
        {farm ? <Button type="button" variant="danger" onClick={() => void remove()} disabled={saving}><Trash2 />Eliminar</Button> : <span />}
        <div className="flex flex-col-reverse gap-2 sm:flex-row"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" loading={saving}>Guardar</Button></div>
      </div>
    </form>
  </Modal>;
}
