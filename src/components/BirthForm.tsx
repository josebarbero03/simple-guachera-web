import { useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { addDays, today } from "../lib/calves";
import { errorText, supabase } from "../lib/supabase";
import type { Birth, Farm } from "../lib/types";
import { toast } from "./ui";

type Choice<T> = { value: T; label: string };

/** Botones grandes para elegir una opción (en vez de listas desplegables). */
function Options<T extends string | number | boolean | null>({ label, options, value, onChange, columns = 2 }: { label: string; options: Choice<T>[]; value: T; onChange: (v: T) => void; columns?: number }) {
  return <div>
    <p className="mb-2 text-xl font-black">{label}</p>
    <div className={`grid gap-2 ${columns === 3 ? "grid-cols-3" : columns === 4 ? "grid-cols-4" : "grid-cols-2"}`}>
      {options.map((o) => <button key={String(o.value)} type="button" onClick={() => onChange(o.value)} aria-pressed={value === o.value}
        className={`min-h-14 rounded-2xl border-4 px-2 text-lg font-black ${value === o.value ? "border-brand bg-brand-soft text-brand-dark" : "border-transparent bg-white text-slate-700"}`}>{o.label}</button>)}
    </div>
  </div>;
}

/** El operario avisa un nacimiento; productor o veterinario lo revisan y lo cargan como ternero. */
export function BirthForm({ farm, onSent }: { farm: Farm; onSent: () => void }) {
  const [tag, setTag] = useState("");
  const [noTag, setNoTag] = useState(false);
  const [sex, setSex] = useState<Birth["sex"]>(null);
  const [when, setWhen] = useState<"hoy" | "ayer" | "otro">("hoy");
  const [otherDate, setOtherDate] = useState(addDays(today(), -2));
  const [calving, setCalving] = useState<Birth["calving"]>("Normal");
  const [alive, setAlive] = useState(true);
  const [liters, setLiters] = useState<number | null>(null);
  const [hours, setHours] = useState<number | null>(null);
  const [weight, setWeight] = useState("");
  const [mother, setMother] = useState("");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const birthDate = when === "hoy" ? today() : when === "ayer" ? addDays(today(), -1) : otherDate;

  async function send() {
    if (!noTag && !tag.trim()) { toast.error("Escribí la caravana o tocá “Todavía no tiene”."); return; }
    if (!sex) { toast.error("Elegí si es hembra o macho."); return; }
    const kg = weight.trim() ? Number(weight.replace(",", ".")) : null;
    if (kg !== null && (!Number.isFinite(kg) || kg <= 0 || kg >= 120)) { toast.error("Revisá el peso."); return; }
    setSending(true);
    const { error } = await supabase.from("simple_guachera_births").insert({
      farm_id: farm.id, tag: noTag ? "" : tag.trim(), sex, birth_date: birthDate, birth_weight: kg, mother_tag: mother.trim(),
      calving, alive, colostrum_liters: alive ? liters : null, colostrum_hours: alive && liters ? hours : null, notes: notes.trim(),
    });
    setSending(false);
    if (error) { toast.error(errorText(error, "No se pudo enviar el nacimiento")); return; }
    toast.ok("Nacimiento enviado");
    onSent();
  }

  return <div className="space-y-6">
    <h2 className="text-3xl font-black">Nacimiento</h2>

    <div>
      <p className="mb-2 text-xl font-black">Caravana</p>
      {noTag ? <button type="button" onClick={() => setNoTag(false)} className="h-16 w-full rounded-2xl border-4 border-brand bg-brand-soft text-lg font-black text-brand-dark">Todavía no tiene caravana (tocar para escribir)</button> : <>
        <input value={tag} onChange={(e) => setTag(e.target.value)} inputMode="numeric" placeholder="Número" className="h-16 w-full rounded-2xl border-2 border-[#cedad5] bg-white px-4 text-3xl font-black outline-none focus:border-brand" aria-label="Caravana del ternero" />
        <button type="button" onClick={() => { setNoTag(true); setTag(""); }} className="mt-2 text-lg font-bold text-slate-600 underline">Todavía no tiene caravana</button>
      </>}
    </div>

    <Options label="¿Hembra o macho?" value={sex} onChange={setSex} options={[{ value: "Hembra", label: "Hembra" }, { value: "Macho", label: "Macho" }]} />

    <div>
      <Options label="¿Cuándo nació?" value={when} onChange={setWhen} columns={3} options={[{ value: "hoy", label: "Hoy" }, { value: "ayer", label: "Ayer" }, { value: "otro", label: "Otro día" }]} />
      {when === "otro" ? <input type="date" value={otherDate} max={today()} onChange={(e) => e.target.value && setOtherDate(e.target.value)} className="mt-2 h-14 w-full rounded-2xl border-2 border-[#cedad5] bg-white px-4 text-xl font-bold" aria-label="Fecha de nacimiento" /> : null}
    </div>

    <Options label="¿Cómo fue el parto?" value={calving} onChange={setCalving} columns={3} options={[{ value: "Normal", label: "Normal" }, { value: "Con ayuda", label: "Con ayuda" }, { value: "Difícil", label: "Difícil" }]} />

    <Options label="¿Nació vivo?" value={alive} onChange={setAlive} options={[{ value: true, label: "Sí, vivo" }, { value: false, label: "Nació muerto" }]} />

    {alive ? <>
      <Options label="¿Cuánto calostro tomó?" value={liters} onChange={setLiters} columns={4} options={[{ value: null, label: "Todavía no" }, { value: 2, label: "2 L" }, { value: 3, label: "3 L" }, { value: 4, label: "4 L o más" }]} />
      {liters ? <Options label="¿Cuánto después de nacer?" value={hours} onChange={setHours} columns={3} options={[{ value: 1, label: "Menos de 2 h" }, { value: 4, label: "2 a 6 h" }, { value: 8, label: "Más de 6 h" }]} /> : null}
    </> : null}

    <details className="rounded-2xl bg-white p-4">
      <summary className="cursor-pointer text-lg font-bold text-slate-700">Más datos (si los sabés)</summary>
      <div className="mt-3 space-y-3">
        <label className="block text-lg font-bold">Peso (kg)<input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" className="mt-1 h-14 w-full rounded-2xl border-2 border-[#cedad5] px-4 text-xl" /></label>
        <label className="block text-lg font-bold">Caravana de la madre<input value={mother} onChange={(e) => setMother(e.target.value)} inputMode="numeric" className="mt-1 h-14 w-full rounded-2xl border-2 border-[#cedad5] px-4 text-xl" /></label>
        <label className="block text-lg font-bold">Comentario<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-2xl border-2 border-[#cedad5] p-3 text-lg" /></label>
      </div>
    </details>

    <button type="button" onClick={() => void send()} disabled={sending} className="flex h-20 w-full items-center justify-center gap-3 rounded-2xl bg-brand text-2xl font-black text-white shadow-lg disabled:opacity-60">
      {sending ? <RefreshCw className="size-7 animate-spin" /> : <Check className="size-8" />}{sending ? "Enviando…" : "ENVIAR NACIMIENTO"}
    </button>
    <p className="text-center text-slate-500">El productor o el veterinario lo revisa y lo carga.</p>
  </div>;
}
