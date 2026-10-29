import { useEffect, useState } from "react";
import { addDays, format } from "date-fns";
import { Plus, Trash2, Eye, Send, Save, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { fmtMoney } from "@/lib/constants";
import { ProductSelect } from "@/components/ProductSelect";

const Preview = ({ pv }) => (
  <div className="grid grid-cols-2 gap-4" data-testid="proposal-preview">
    <div className="rounded-md border border-slate-200">
      <div className="border-b bg-[#0a3b7c] px-4 py-2 text-sm font-semibold text-white">Anteprima proposta</div>
      <div className="p-4 text-sm">
        <div className="mb-2 text-slate-600">Cliente: <b className="text-slate-900">{pv.cliente?.nome}</b></div>
        <table className="w-full text-xs">
          <thead><tr className="text-left text-slate-500"><th>Prodotto</th><th>Q.tà</th><th>Sconto</th><th className="text-right">Totale</th></tr></thead>
          <tbody>{pv.righe.map((r) => (
            <tr key={r.prodotto_id} className="border-t"><td className="py-1">{r.nome}</td><td>{r.quantita}</td><td>{r.sconto_pct}%</td><td className="text-right font-mono">{fmtMoney(r.totale)}</td></tr>
          ))}</tbody>
        </table>
        <div className="mt-3 flex justify-between border-t pt-2 font-semibold"><span>Totale</span><span className="font-mono" data-testid="proposal-preview-total">{fmtMoney(pv.totale)}</span></div>
        {pv.sotto_minimo && <div className="mt-2 flex items-center gap-1 text-xs text-red-600"><AlertTriangle className="h-3.5 w-3.5" />Prezzo sotto il minimo consigliato</div>}
      </div>
    </div>
    <div className="rounded-md border border-slate-200">
      <div className="border-b bg-slate-50 px-4 py-2 text-sm"><div className="text-xs text-slate-500">A: {pv.email.a}</div><div className="font-semibold">{pv.email.oggetto}</div></div>
      <pre className="whitespace-pre-wrap p-4 font-sans text-xs leading-relaxed text-slate-700" data-testid="proposal-preview-email">{pv.email.corpo}</pre>
    </div>
  </div>
);

export const ProposalDialog = ({ open, onOpenChange, deal, onSaved }) => {
  const { products } = useApp();
  const init = () => ({
    righe: (deal?.prodotti?.length ? deal.prodotti : [""]).map((id) => ({ prodotto_id: id, quantita: 1, sconto_pct: 0 })),
    scadenza: format(addDays(new Date(), 7), "yyyy-MM-dd"), modalita_pagamento: "bonifico", num_rate: 3, note: "",
  });
  const [f, setF] = useState(init);
  const [pv, setPv] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setF(init()); setPv(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const setRow = (i, k, v) => setF((x) => ({ ...x, righe: x.righe.map((r, j) => (j === i ? { ...r, [k]: v } : r)) }));
  const body = () => ({ ...f, deal_id: deal.id, righe: f.righe.filter((r) => r.prodotto_id).map((r) => ({ ...r, quantita: Number(r.quantita) || 1, sconto_pct: Number(r.sconto_pct) || 0 })),
    num_rate: Number(f.num_rate) || 1 });
  const preview = async () => {
    setBusy(true);
    try { setPv((await api.post("/contratti/anteprima", body())).data); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const create = async (invia) => {
    setBusy(true);
    try {
      const r = await api.post("/contratti/proposte", { ...body(), invia });
      toast.success(invia ? `Proposta ${r.data.id} inviata` : `Bozza ${r.data.id} salvata`);
      onOpenChange(false); onSaved?.(r.data);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const price = (id) => products.find((p) => p.id === id);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl" data-testid="proposal-dialog">
        <DialogHeader><DialogTitle className="font-display">Crea proposta · {deal?.titolo}</DialogTitle></DialogHeader>
        {!pv ? (
          <div className="space-y-4">
            <div className="space-y-2">
              {f.righe.map((r, i) => (
                <div key={i} className="flex items-end gap-2" data-testid={`proposal-row-${i}`}>
                  <label className="flex-1 text-xs font-medium text-slate-600">Prodotto
                    <ProductSelect value={r.prodotto_id} onChange={(p) => setRow(i, "prodotto_id", p?.id || "")} testid={`proposal-product-${i}`} className="crm-select mt-1 w-full" />
                  </label>
                  <label className="w-20 text-xs font-medium text-slate-600">Q.tà<input type="number" min="1" className="crm-input mt-1" value={r.quantita} onChange={(e) => setRow(i, "quantita", e.target.value)} data-testid={`proposal-qty-${i}`} /></label>
                  <label className="w-24 text-xs font-medium text-slate-600">Sconto %<input type="number" min="0" max="100" className="crm-input mt-1" value={r.sconto_pct} onChange={(e) => setRow(i, "sconto_pct", e.target.value)} data-testid={`proposal-discount-${i}`} /></label>
                  <div className="w-28 pb-2 text-right font-mono text-sm">{price(r.prodotto_id) ? fmtMoney(price(r.prodotto_id).prezzo * (r.quantita || 1) * (1 - (r.sconto_pct || 0) / 100)) : "—"}</div>
                  <button className="mb-1 rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => setF((x) => ({ ...x, righe: x.righe.filter((_, j) => j !== i) }))} data-testid={`proposal-remove-row-${i}`}><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <button className="text-sm font-medium text-[#0a3b7c]" onClick={() => setF((x) => ({ ...x, righe: [...x.righe, { prodotto_id: "", quantita: 1, sconto_pct: 0 }] }))} data-testid="proposal-add-row"><Plus className="inline h-4 w-4" /> Aggiungi prodotto</button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="text-xs font-medium text-slate-600">Scadenza proposta<input type="date" className="crm-input mt-1" value={f.scadenza} onChange={(e) => setF({ ...f, scadenza: e.target.value })} data-testid="proposal-scadenza" /></label>
              <label className="text-xs font-medium text-slate-600">Modalità di pagamento
                <select className="crm-select mt-1 w-full" value={f.modalita_pagamento} onChange={(e) => setF({ ...f, modalita_pagamento: e.target.value })} data-testid="proposal-pagamento">
                  <option value="bonifico">Bonifico</option><option value="rate">Rate</option><option value="link">Link di pagamento</option>
                </select>
              </label>
              {f.modalita_pagamento === "rate" && <label className="text-xs font-medium text-slate-600">Numero rate<input type="number" min="2" max="12" className="crm-input mt-1" value={f.num_rate} onChange={(e) => setF({ ...f, num_rate: e.target.value })} data-testid="proposal-num-rate" /></label>}
            </div>
            <label className="block text-xs font-medium text-slate-600">Note interne<textarea className="crm-input mt-1 h-16 py-2" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} data-testid="proposal-note" /></label>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => onOpenChange(false)}>Annulla</button>
              <button className="btn-primary" disabled={busy} onClick={preview} data-testid="proposal-preview-btn"><Eye className="h-4 w-4" />Anteprima proposta e mail</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Preview pv={pv} />
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setPv(null)} data-testid="proposal-back-btn">Modifica</button>
              <button className="btn-ghost" disabled={busy} onClick={() => create(false)} data-testid="proposal-save-draft-btn"><Save className="h-4 w-4" />Salva bozza</button>
              <button className="btn-gold" disabled={busy} onClick={() => create(true)} data-testid="proposal-send-btn"><Send className="h-4 w-4" />Crea e invia</button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
