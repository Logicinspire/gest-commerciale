import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { FASI, fmtMoney } from "@/lib/constants";
import { PersonPicker } from "@/components/PersonPicker";
import { ProductMulti } from "@/components/ProductSelect";

export const DealDialog = ({ open, onOpenChange, person, onSaved }) => {
  const { team, me, products } = useApp();
  const [f, setF] = useState({});
  useEffect(() => {
    if (open) setF({ titolo: "", valore: "", fase: FASI[0], owner_id: me.user_id, prodotti: [], person: person || null });
  }, [open, person, me.user_id]);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setProducts = (ids) => {
    const sel = products.filter((p) => ids.includes(p.id));
    setF((x) => ({ ...x, prodotti: ids, valore: sel.reduce((s, p) => s + p.prezzo, 0) || x.valore,
      titolo: x.titolo || sel.map((p) => p.nome).join(" + ") }));
  };
  const minimo = products.filter((p) => (f.prodotti || []).includes(p.id)).reduce((s, p) => s + p.prezzo_minimo, 0);
  const save = async () => {
    try {
      const r = await api.post("/deals", { titolo: f.titolo, valore: Number(f.valore) || 0, fase: f.fase, owner_id: f.owner_id,
        person_id: f.person?.id, prodotti: f.prodotti });
      toast.success("Affare creato");
      onOpenChange(false);
      onSaved?.(r.data);
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" data-testid="deal-dialog">
        <DialogHeader><DialogTitle className="font-display">Nuovo affare</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="block text-xs font-medium text-slate-600">Persona di contatto
            <div className="mt-1"><PersonPicker value={f.person} onChange={(p) => set("person", p)} testid="deal-person-picker" /></div>
          </label>
          <div className="text-xs font-medium text-slate-600">Prodotti (dal gestionale contratti)
            <div className="mt-1"><ProductMulti value={f.prodotti} onChange={setProducts} /></div>
          </div>
          <label className="block text-xs font-medium text-slate-600">Titolo
            <input className="crm-input mt-1" value={f.titolo || ""} onChange={(e) => set("titolo", e.target.value)} data-testid="deal-field-titolo" />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className="text-xs font-medium text-slate-600">Valore (€)
              <input type="number" className="crm-input mt-1" value={f.valore} onChange={(e) => set("valore", e.target.value)} data-testid="deal-field-valore" />
              {minimo > 0 && <span className={`text-[11px] ${Number(f.valore) < minimo ? "text-red-600" : "text-slate-500"}`}>Minimo consigliato {fmtMoney(minimo)}</span>}
            </label>
            <label className="text-xs font-medium text-slate-600">Fase
              <select className="crm-select mt-1 w-full" value={f.fase} onChange={(e) => set("fase", e.target.value)} data-testid="deal-field-fase">
                {FASI.map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">Proprietario
              <select className="crm-select mt-1 w-full" value={f.owner_id} onChange={(e) => set("owner_id", e.target.value)} data-testid="deal-field-owner">
                {team.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={() => onOpenChange(false)}>Annulla</button>
          <button className="btn-primary" onClick={save} data-testid="deal-save-btn">Salva</button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
