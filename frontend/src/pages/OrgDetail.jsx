import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Building2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { fmtMoney } from "@/lib/constants";
import { LabelList } from "@/components/LabelPill";

export default function OrgDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { isAdmin } = useApp();
  const [d, setD] = useState(null);
  useEffect(() => { api.get(`/organizations/${id}`).then((r) => setD(r.data)).catch(() => nav("/contatti/organizzazioni")); }, [id, nav]);
  if (!d) return <div className="p-10 text-sm text-slate-500">Caricamento…</div>;
  const del = async () => { if (!window.confirm("Eliminare l'organizzazione?")) return; await api.delete(`/organizations/${id}`); toast.success("Eliminata"); nav("/contatti/organizzazioni"); };
  return (
    <div className="p-6 fade-in" data-testid="org-detail">
      <div className="mb-6 flex items-center gap-3">
        <Building2 className="h-8 w-8 text-[#0a3b7c]" />
        <h1 className="font-display text-2xl font-semibold">{d.org.nome}</h1>
        <span className="text-sm text-slate-500">{[d.org.indirizzo, d.org.citta, d.org.telefono, d.org.email].filter(Boolean).join(" · ")}</span>
        {isAdmin && <button className="btn-ghost ml-auto text-red-600" onClick={del} data-testid="delete-org-btn"><Trash2 className="h-4 w-4" />Elimina</button>}
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="crm-card p-4"><h3 className="mb-3 font-semibold">Persone ({d.persons.length})</h3>
          {d.persons.map((p) => <button key={p.id} onClick={() => nav(`/persone/${p.id}`)} className="flex w-full items-center justify-between border-b border-slate-100 py-2 text-left text-sm hover:text-[#0a3b7c]"><span>{p.full_name}</span><LabelList labels={p.etichette} /></button>)}
        </div>
        <div className="crm-card p-4"><h3 className="mb-3 font-semibold">Affari ({d.deals.length})</h3>
          {d.deals.map((x) => <div key={x.id} className="flex justify-between border-b border-slate-100 py-2 text-sm"><span>{x.titolo} · {x.fase}</span><span className="font-mono">{fmtMoney(x.valore)}</span></div>)}
        </div>
      </div>
    </div>
  );
}
