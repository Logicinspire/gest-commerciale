import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Columns3, List, Plus, Zap, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { FASI, AUTO_FASI, FASE_COLORS, fmtDateTime, fmtMoney, initials } from "@/lib/constants";
import { DealDialog } from "@/components/DealDialog";

const slug = (s) => s.toLowerCase().replace(/\s+/g, "-");

const Kanban = ({ owner, reloadKey, onReload }) => {
  const { userName } = useApp();
  const nav = useNavigate();
  const [cols, setCols] = useState([]);
  const [over, setOver] = useState(null);
  useEffect(() => { api.get("/deals/pipeline", { params: { owner } }).then((r) => setCols(r.data)); }, [owner, reloadKey]);
  const drop = async (fase, e) => {
    setOver(null);
    const id = e.dataTransfer.getData("deal");
    try { await api.patch(`/deals/${id}`, { fase }); toast.success(`Spostato in ${fase}`); onReload(); } catch (er) { toast.error(errMsg(er)); }
  };
  return (
    <div className="flex h-full gap-3 overflow-x-auto p-4" data-testid="deals-kanban">
      {cols.map((c) => (
        <div key={c.fase} onDragOver={(e) => { e.preventDefault(); setOver(c.fase); }} onDragLeave={() => setOver(null)} onDrop={(e) => drop(c.fase, e)}
          className={`flex w-72 shrink-0 flex-col rounded-lg transition-colors ${over === c.fase ? "bg-[#0a3b7c]/10" : "bg-slate-100"}`} data-testid={`kanban-stage-${slug(c.fase)}`}>
          <div className="border-b-2 px-3 py-2.5" style={{ borderColor: FASE_COLORS[c.fase] }}>
            <div className="flex items-center gap-1.5 text-sm font-semibold">{c.fase}
              {AUTO_FASI.includes(c.fase) && <Zap className="h-3.5 w-3.5 text-[#C9A227]" title="Aggiornata dal gestionale contratti" />}</div>
            <div className="text-xs text-slate-500">{fmtMoney(c.total)} · {c.count} affari</div>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-2">
            {c.items.map((d) => (
              <div key={d.id} draggable onDragStart={(e) => e.dataTransfer.setData("deal", d.id)} onClick={() => nav(`/affari/${d.id}`)}
                className="cursor-grab rounded-md border border-slate-200 bg-white p-2.5 shadow-sm transition-shadow hover:shadow-md" data-testid={`kanban-card-${d.id}`}>
                <div className="text-sm font-medium text-slate-900">{d.titolo}</div>
                <div className="text-xs text-slate-500">{d.person?.full_name || "—"}</div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-mono text-xs">{fmtMoney(d.valore)}</span>
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0a3b7c] text-[10px] font-bold text-white" title={userName(d.owner_id)}>{initials(userName(d.owner_id) || "?")}</span>
                </div>
              </div>
            ))}
            {c.count > c.items.length && <div className="text-center text-xs text-slate-500">+ altri {c.count - c.items.length}</div>}
          </div>
        </div>
      ))}
    </div>
  );
};

const DealList = ({ owner, reloadKey, onReload }) => {
  const { userName, isAdmin } = useApp();
  const nav = useNavigate();
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [data, setData] = useState({ items: [], total: 0 });
  useEffect(() => { api.get("/deals", { params: { owner, status, q, limit: 100 } }).then((r) => setData(r.data)); }, [owner, status, q, reloadKey]);
  const del = async (d) => { if (!window.confirm(`Eliminare ${d.titolo}?`)) return; await api.delete(`/deals/${d.id}`); toast.success("Affare eliminato"); onReload(); };
  return (
    <div className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <select className="crm-select" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="deals-status-filter">
          <option value="all">Tutti</option><option value="open">Aperti</option><option value="won">Aggiudicati</option><option value="lost">Persi</option><option value="closed">Aggiudicati o persi</option>
        </select>
        <input className="crm-input w-64" placeholder="Cerca per titolo" value={q} onChange={(e) => setQ(e.target.value)} data-testid="deals-search" />
        <span className="ml-auto text-sm font-semibold" data-testid="deals-total">{data.total} affari</span>
      </div>
      <div className="overflow-auto rounded-md border border-slate-200 bg-white">
        <table className="w-full border-collapse" data-testid="deals-table">
          <thead><tr><th className="th">Affare creato</th><th className="th">Titolo</th><th className="th text-right">Valore</th><th className="th">Persona di contatto</th><th className="th">Proprietario</th><th className="th">Fase</th>{isAdmin && <th className="th" />}</tr></thead>
          <tbody>
            {data.items.map((d) => (
              <tr key={d.id} className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/affari/${d.id}`)} data-testid={`deal-row-${d.id}`}>
                <td className="td text-[#0a3b7c]">{fmtDateTime(d.created_at)}</td><td className="td max-w-xs truncate text-[#0a3b7c]">{d.titolo}</td>
                <td className="td text-right font-mono">{fmtMoney(d.valore)}</td><td className="td">{d.person?.full_name || "—"}</td>
                <td className="td">{userName(d.owner_id) || d.owner_import || "—"}</td>
                <td className="td"><span className="rounded px-1.5 py-0.5 text-[11px] font-bold uppercase text-white" style={{ background: FASE_COLORS[d.fase] }}>{d.fase}</span></td>
                {isAdmin && <td className="td" onClick={(e) => e.stopPropagation()}><button onClick={() => del(d)} data-testid={`delete-deal-${d.id}`}><Trash2 className="h-4 w-4 text-slate-400 hover:text-red-600" /></button></td>}
              </tr>
            ))}
            {!data.items.length && <tr><td colSpan={7} className="p-10 text-center text-sm text-slate-500">Nessun affare</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default function DealsPage() {
  const { team } = useApp();
  const [view, setView] = useState("kanban");
  const [owner, setOwner] = useState("");
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  const reload = useCallback(() => setKey((k) => k + 1), []);
  return (
    <div className="flex h-full flex-col fade-in">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex overflow-hidden rounded-md border border-slate-300">
          <button className={`px-3 py-1.5 ${view === "kanban" ? "bg-[#0a3b7c]/10 text-[#0a3b7c]" : ""}`} onClick={() => setView("kanban")} data-testid="deals-view-kanban"><Columns3 className="h-4 w-4" /></button>
          <button className={`border-l px-3 py-1.5 ${view === "list" ? "bg-[#0a3b7c]/10 text-[#0a3b7c]" : ""}`} onClick={() => setView("list")} data-testid="deals-view-list"><List className="h-4 w-4" /></button>
        </div>
        <button className="btn-primary" onClick={() => setOpen(true)} data-testid="add-deal-page-btn"><Plus className="h-4 w-4" />Affare</button>
        <span className="ml-4 flex items-center gap-1 text-xs text-slate-500"><Zap className="h-3.5 w-3.5 text-[#C9A227]" />Proposta inviata, Remind, Aggiudicato e Perso arrivano in automatico da contratti</span>
        <select className="crm-select ml-auto" value={owner} onChange={(e) => setOwner(e.target.value)} data-testid="deals-owner-filter">
          <option value="">Tutti i commerciali</option>{team.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
        </select>
      </div>
      <div className="min-h-0 flex-1">{view === "kanban" ? <Kanban owner={owner} reloadKey={key} onReload={reload} /> : <DealList owner={owner} reloadKey={key} onReload={reload} />}</div>
      <DealDialog open={open} onOpenChange={setOpen} onSaved={reload} />
    </div>
  );
}
