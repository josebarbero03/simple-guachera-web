import { useMemo, useState, type ChangeEvent } from "react";
import { AlertCircle, CheckCircle2, FileUp, Upload } from "lucide-react";
import { parseBulkCalves } from "../lib/bulk";
import { formatDate, formatKg, today } from "../lib/calves";
import { errorText, supabase } from "../lib/supabase";
import { Button, Modal, Textarea, toast } from "./ui";

const EXAMPLE = "2418\t15/10/2026\tH\t38\tEstaca A-06\n2419\t16/10/2026\tM\t41\tEstaca A-07";

export function BulkCalvesModal({ farmId, existingTags, onClose, onSaved }: { farmId: string; existingTags: string[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const rows = useMemo(() => parseBulkCalves(text, existingTags, today()), [text, existingTags]);
  const valid = rows.filter((r) => r.value);
  const invalid = rows.length - valid.length;

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/\.(csv|txt|tsv)$/i.test(file.name)) { toast.error("Subí un archivo .csv. En Excel: Archivo → Guardar como → CSV."); return; }
    setText(await file.text());
  }

  async function save() {
    if (!valid.length) return;
    setSaving(true);
    const { error } = await supabase.from("simple_guachera_calves").insert(valid.map((r) => ({ ...r.value!, farm_id: farmId })));
    setSaving(false);
    if (error) { toast.error(errorText(error, "No se pudieron cargar")); return; }
    toast.ok(`${valid.length} terneros cargados`);
    await onSaved();
  }

  return <Modal title="Carga masiva de terneros" onClose={onClose}>
    <div className="space-y-4">
      <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
        <p>Copiá las filas desde Excel y pegalas abajo, o subí un archivo CSV. Columnas en este orden:</p>
        <p className="mt-1 font-bold text-slate-800">Caravana · Fecha de nacimiento · Sexo (H/M) · Peso al nacer · Ubicación</p>
        <p className="mt-1">Solo caravana y fecha son obligatorias. Si la primera fila es un encabezado, se ignora.</p>
      </div>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={EXAMPLE} className="font-mono text-sm" aria-label="Datos a cargar" />
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-bold text-brand"><FileUp className="size-4" />Subir archivo CSV<input type="file" accept=".csv,.txt,.tsv,text/csv" onChange={(e) => void readFile(e)} className="hidden" /></label>

      {rows.length ? <div>
        <p className="mb-2 flex flex-wrap gap-x-4 text-sm font-bold"><span className="text-brand-dark">{valid.length} listos</span>{invalid ? <span className="text-rose-600">{invalid} con errores (no se cargan)</span> : null}</p>
        <ul className="max-h-60 overflow-y-auto rounded-xl border border-[#dce5e1] text-sm">
          {rows.map((r) => <li key={r.line} className={`flex items-start gap-2 border-b border-[#edf2f0] px-3 py-2 last:border-0 ${r.error ? "bg-rose-50/60" : ""}`}>
            {r.error ? <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-600" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand" />}
            {r.value ? <span className="min-w-0"><strong>{r.value.tag}</strong> · {formatDate(r.value.birth_date)} · {r.value.sex}{r.value.birth_weight ? ` · ${formatKg(r.value.birth_weight)}` : ""}{r.value.location ? ` · ${r.value.location}` : ""}</span>
              : <span className="min-w-0"><span className="text-slate-500">Fila {r.line}:</span> <span className="font-semibold text-rose-700">{r.error}</span><span className="block truncate font-mono text-xs text-slate-400">{r.raw}</span></span>}
          </li>)}
        </ul>
      </div> : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => void save()} loading={saving} disabled={!valid.length}>{!saving ? <Upload /> : null}Cargar {valid.length || ""} terneros</Button>
      </div>
    </div>
  </Modal>;
}
