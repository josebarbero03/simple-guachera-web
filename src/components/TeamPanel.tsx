import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Mail, Trash2, UserPlus, Users } from "lucide-react";
import { INVITABLE_ROLES, ROLE_LABEL } from "../lib/roles";
import { errorText, supabase } from "../lib/supabase";
import type { Farm, Invitation, Member, Role } from "../lib/types";
import { Button, Card, Field, Input, Select, toast } from "./ui";

const ROLE_HELP: Record<(typeof INVITABLE_ROLES)[number], string> = {
  operario: "Ve los tratamientos del día y registra tareas.",
  veterinario: "Todas las funciones: protocolos, tratamientos, terneros y equipo.",
  productor: "Todas las funciones: protocolos, tratamientos, terneros y equipo.",
};

export function TeamPanel({ farm, userId }: { farm: Farm; userId: string }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof INVITABLE_ROLES)[number]>("operario");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [m, i] = await Promise.all([
      supabase.from("simple_guachera_farm_members").select("*").eq("farm_id", farm.id).order("created_at"),
      supabase.from("simple_guachera_invitations").select("*").eq("farm_id", farm.id).order("created_at"),
    ]);
    if (m.error) { toast.error(errorText(m.error, "No se pudo cargar el equipo")); setMembers((x) => x ?? []); return; }
    setMembers(m.data as Member[]);
    setInvitations((i.data ?? []) as Invitation[]);
  }, [farm.id]);

  useEffect(() => { void load(); }, [load]);

  async function add(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const { data, error } = await supabase.rpc("simple_guachera_add_member", { target_farm: farm.id, member_email: email.trim(), member_role: role });
    setSaving(false);
    if (error) { toast.error(errorText(error, "No se pudo agregar")); return; }
    toast.ok(data === "agregado" ? `${email.trim()} ya forma parte del equipo` : `Invitación guardada: cuando ${email.trim()} cree su cuenta, entra directo`);
    setEmail("");
    await load();
  }

  async function changeRole(member: Member, next: Role) {
    const { error } = await supabase.rpc("simple_guachera_set_member_role", { target_farm: farm.id, member: member.user_id, member_role: next });
    if (error) { toast.error(errorText(error, "No se pudo cambiar el rol")); return; }
    toast.ok("Rol actualizado");
    await load();
  }

  async function removeMember(member: Member) {
    if (!window.confirm(`¿Quitar a ${member.display_name || member.email} de ${farm.name}?`)) return;
    const { error } = await supabase.rpc("simple_guachera_remove_member", { target_farm: farm.id, member: member.user_id });
    if (error) { toast.error(errorText(error, "No se pudo quitar")); return; }
    await load();
  }

  async function cancelInvitation(inv: Invitation) {
    const { error } = await supabase.from("simple_guachera_invitations").delete().eq("farm_id", farm.id).eq("email", inv.email);
    if (error) { toast.error(errorText(error, "No se pudo cancelar")); return; }
    await load();
  }

  return <div className="space-y-4">
    <div><h1 className="text-2xl font-black">Equipo</h1><p className="text-sm text-slate-600">Quiénes trabajan en {farm.name} y qué pueden hacer</p></div>

    <Card>
      <form onSubmit={add} className="space-y-3">
        <p className="flex items-center gap-2 font-black"><UserPlus className="size-5 text-brand" />Sumar persona</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_200px]">
          <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@correo.com" required /></Field>
          <Field label="Rol"><Select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>{INVITABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select></Field>
        </div>
        <p className="text-sm text-slate-500">{ROLE_HELP[role]} Si todavía no tiene cuenta, que la cree en esta app con ese mismo email.</p>
        <Button type="submit" loading={saving} className="w-full sm:w-auto">Agregar</Button>
      </form>
    </Card>

    {members === null ? <p className="py-6 text-center text-slate-500">Cargando…</p> : <ul className="space-y-2">
      {members.map((m) => {
        const owner = m.role === "propietario";
        return <li key={m.user_id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#dce5e1] bg-white p-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft font-black text-brand-dark">{(m.display_name || m.email || "?").charAt(0).toUpperCase()}</span>
          <div className="min-w-0 flex-1"><p className="truncate font-black">{m.display_name || m.email}{m.user_id === userId ? <span className="font-semibold text-slate-400"> (vos)</span> : null}</p><p className="truncate text-sm text-slate-500">{m.email}</p></div>
          {owner ? <span className="rounded-full bg-brand-deep px-3 py-1 text-xs font-bold text-white">{ROLE_LABEL.propietario}</span> : <>
            <button onClick={() => void removeMember(m)} className="grid size-10 place-items-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600 sm:order-last" aria-label={`Quitar a ${m.email}`}><Trash2 className="size-4" /></button>
            <Select value={m.role} onChange={(e) => void changeRole(m, e.target.value as Role)} className="!mt-0 !h-10 sm:w-48" aria-label={`Rol de ${m.email}`}>{INVITABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select>
          </>}
        </li>;
      })}
      {invitations.map((inv) => <li key={inv.email} className="flex items-center gap-3 rounded-2xl border border-dashed border-[#cedad5] bg-white/60 p-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500"><Mail className="size-4" /></span>
        <div className="min-w-0 flex-1"><p className="truncate font-bold">{inv.email}</p><p className="text-sm text-slate-500">Invitado como {ROLE_LABEL[inv.role]} · todavía no creó su cuenta</p></div>
        <button onClick={() => void cancelInvitation(inv)} className="grid size-10 place-items-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Cancelar invitación a ${inv.email}`}><Trash2 className="size-4" /></button>
      </li>)}
      {members.length === 1 && !invitations.length ? <li className="flex items-center gap-2 px-1 text-sm text-slate-500"><Users className="size-4" />Por ahora sos la única persona en este establecimiento.</li> : null}
    </ul>}
  </div>;
}
