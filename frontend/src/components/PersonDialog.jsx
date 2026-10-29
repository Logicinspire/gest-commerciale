import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { LabelPicker } from "@/components/LabelPill";
import { ProductSelect } from "@/components/ProductSelect";

const FIELDS = [
  ["nome", "Nome"], ["cognome", "Cognome"], ["email", "Email", "email"], ["telefono", "Telefono"],
  ["professione", "Professione"], ["primo_contatto", "Primo contatto", "date"], ["tipo_marketing", "Tipo marketing"],
  ["citta", "Città"], ["privacy", "Privacy"],
];

export const PersonDialog = ({ open, onOpenChange, person, onSaved }) => {
  const { isAdmin, team } = useApp();
  const nav = useNavigate();
  const [form, setForm] = useState({});
  const [dups, setDups] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setForm(person ? { ...person } : { etichette: [] }); setDups([]); } }, [open, person]);

  useEffect(() => {
    if (!open || (!form.email && !form.telefono)) { setDups([]); return; }
    const t = setTimeout(() => api.get("/persons/check-duplicates", { params: { email: form.email || "", telefono: form.telefono || "", exclude: person?.id || "" } })
      .then((r) => setDups(r.data)), 400);
    return () => clearTimeout(t);
  }, [form.email, form.telefono, open, person]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const save = async (force = false) => {
    setSaving(true);
    const keys = [...FIELDS.map((f) => f[0]), "etichette", "prodotto_richiesto", "prodotto_id", ...(isAdmin ? ["owner_id"] : [])];
    const body = Object.fromEntries(keys.filter((k) => form[k] !== undefined).map((k) => [k, form[k] === "" ? null : form[k]]));
    try {
      const r = person ? await api.patch(`/persons/${person.id}`, { ...body, force }) : await api.post("/persons", { ...body, force });
      toast.success(person ? "Contatto aggiornato" : "Contatto creato");
      onOpenChange(false);
      onSaved?.(r.data);
    } catch (e) {
      if (e.response?.status === 409) { setDups(e.response.data.detail.duplicates || []); toast.warning("Possibile doppione: controlla prima di salvare"); }
      else toast.error(errMsg(e));
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="person-dialog">
        <DialogHeader><DialogTitle className="font-display">{person ? "Modifica persona" : "Nuova persona"}</DialogTitle></DialogHeader>
        {dups.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm" data-testid="duplicate-warning">
            <div className="mb-1 flex items-center gap-2 font-semibold text-amber-800"><AlertTriangle className="h-4 w-4" />Esiste già un contatto con questa email o telefono</div>
            {dups.map((d) => (
              <button key={d.id} type="button" onClick={() => { onOpenChange(false); nav(`/persone/${d.id}`); }} className="block text-left text-[#0a3b7c] hover:underline" data-testid={`duplicate-link-${d.id}`}>
                {d.full_name} · {d.email} · {d.telefono}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map(([k, label, type]) => (
            <label key={k} className="text-xs font-medium text-slate-600">{label}
              <input type={type || "text"} className="crm-input mt-1" value={form[k] || ""} onChange={(e) => set(k, e.target.value)} data-testid={`person-field-${k}`} />
            </label>
          ))}
          <label className="text-xs font-medium text-slate-600">Prodotto richiesto
            <div className="mt-1"><ProductSelect value={form.prodotto_id} testid="person-field-prodotto"
              onChange={(p) => setForm((f) => ({ ...f, prodotto_id: p?.id || null, prodotto_richiesto: p?.nome || null }))} /></div>
            {form.prodotto_richiesto && !form.prodotto_id && <span className="text-[11px] text-slate-500">Attuale: {form.prodotto_richiesto}</span>}
          </label>
          {isAdmin && (
            <label className="text-xs font-medium text-slate-600">Proprietario
              <select className="crm-select mt-1 w-full" value={form.owner_id || ""} onChange={(e) => set("owner_id", e.target.value || null)} data-testid="person-field-owner">
                <option value="">Io</option>
                {team.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
              </select>
            </label>
          )}
          <div className="col-span-2 text-xs font-medium text-slate-600">Etichette
            <div className="mt-1 rounded-md border border-slate-300 p-1"><LabelPicker value={form.etichette || []} onChange={(v) => set("etichette", v)} testid="person-field-etichette" /></div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={() => onOpenChange(false)} data-testid="person-cancel-btn">Annulla</button>
          {dups.length > 0 && <button className="btn-ghost border-amber-400 text-amber-800" disabled={saving} onClick={() => save(true)} data-testid="person-save-anyway-btn">Salva comunque</button>}
          <button className="btn-primary" disabled={saving} onClick={() => save(false)} data-testid="person-save-btn">Salva</button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
