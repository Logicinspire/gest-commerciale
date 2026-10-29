import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, RefreshCw, Hand, User, Building2, Inbox, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { LABEL_COLORS, fmtDate, fmtDateTime } from "@/lib/constants";
import { LabelList } from "@/components/LabelPill";
import { PersonDialog } from "@/components/PersonDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SubNav = ({ counts }) => {
  const items = [
    { to: "/contatti", label: "Persone", Icon: User, id: "persone" },
    { to: "/contatti/organizzazioni", label: "Organizzazioni", Icon: Building2, id: "organizzazioni", n: counts?.organizations },
    { to: "/contatti/da-assegnare", label: "Da assegnare", Icon: Inbox, id: "da-assegnare", n: counts?.da_assegnare, hot: true },
  ];
  const path = window.location.pathname;
  return (
    <nav className="w-56 shrink-0 space-y-1 border-r border-slate-200 bg-white p-3">
      {items.map((i) => (
        <Link key={i.id} to={i.to} data-testid={`subnav-${i.id}`}
          className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${path === i.to ? "bg-[#0a3b7c]/10 text-[#0a3b7c]" : "text-slate-700 hover:bg-slate-50"}`}>
          <i.Icon className="h-4 w-4" />{i.label}
          {i.n > 0 && <span className={`ml-auto rounded-full px-2 text-[11px] font-bold ${i.hot ? "bg-[#C9A227] text-[#071c38]" : "bg-slate-100 text-slate-600"}`} data-testid={`subnav-count-${i.id}`}>{i.n}</span>}
        </Link>
      ))}
    </nav>
  );
};

const Pager = ({ page, setPage, total, limit }) => {
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="flex items-center gap-2 text-sm text-slate-600">
      <button className="btn-ghost h-8 px-2" disabled={page <= 1} onClick={() => setPage(page - 1)} data-testid="pager-prev"><ChevronLeft className="h-4 w-4" /></button>
      <span data-testid="pager-info">Pagina {page} di {pages}</span>
      <button className="btn-ghost h-8 px-2" disabled={page >= pages} onClick={() => setPage(page + 1)} data-testid="pager-next"><ChevronRight className="h-4 w-4" /></button>
    </div>
  );
};

const PersonsTable = ({ view, reloadCounts }) => {
  const { userName, isAdmin, team } = useApp();
  const nav = useNavigate();
  const [data, setData] = useState({ items: [], total: 0 });
  const [page, setPage] = useState(1);
  const [label, setLabel] = useState("");
  const [owner, setOwner] = useState("");
  const [prof, setProf] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const limit = 50;
  const load = useCallback(() => api.get("/persons", { params: { view, page, limit, label, owner, q, professione: prof } }).then((r) => setData(r.data)), [view, page, label, owner, q, prof]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [view, label, owner, q, prof]);

  const take = async (p) => {
    try { await api.post(`/persons/${p.id}/take`); toast.success(`${p.full_name} ora è tuo`); load(); reloadCounts(); }
    catch (e) { toast.error(errMsg(e)); load(); }
  };
  const assign = async (p, uid) => {
    try { await api.post(`/persons/${p.id}/assign`, { owner_id: uid }); toast.success("Lead assegnato"); load(); reloadCounts(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const lead = view === "da_assegnare";
  return (
    <div className="min-w-0 flex-1 p-5 fade-in">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {!lead && <button className="btn-primary" onClick={() => setOpen(true)} data-testid="add-person-btn"><Plus className="h-4 w-4" />Persona</button>}
        {lead && <h2 className="font-display text-lg font-semibold">Nuovi lead da Facebook e dal sito</h2>}
        <input className="crm-input w-64" placeholder="Filtra per nome, email, telefono" value={q} onChange={(e) => setQ(e.target.value)} data-testid="persons-filter-input" />
        <select className="crm-select" value={label} onChange={(e) => setLabel(e.target.value)} data-testid="persons-label-filter">
          <option value="">Tutte le etichette</option>
          {Object.keys(LABEL_COLORS).map((l) => <option key={l}>{l}</option>)}
        </select>
        <select className="crm-select" value={prof} onChange={(e) => setProf(e.target.value)} data-testid="persons-professione-filter">
          <option value="">Tutte le professioni</option>
          {["Ingegnere", "Architetto", "Geometra", "Perito"].map((p) => <option key={p}>{p}</option>)}
        </select>
        {!lead && (
          <select className="crm-select" value={owner} onChange={(e) => setOwner(e.target.value)} data-testid="persons-owner-filter">
            <option value="">Tutti i proprietari</option>
            {team.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
          </select>
        )}
        <div className="ml-auto flex items-center gap-4">
          <button onClick={load} className="flex items-center gap-1.5 text-sm font-semibold text-slate-700" data-testid="persons-total">
            <RefreshCw className="h-4 w-4" />{data.total.toLocaleString("it-IT")} {lead ? "lead" : "persone"}
          </button>
          <Pager page={page} setPage={setPage} total={data.total} limit={limit} />
        </div>
      </div>
      <div className="overflow-auto rounded-md border border-slate-200 bg-white">
        <table className="w-full border-collapse" data-testid="persons-table">
          <thead><tr>
            {lead && <th className="th w-48">Azione</th>}
            <th className="th">Etichette</th><th className="th">Primo contatto</th><th className="th">Aggiornato</th><th className="th">Nome</th><th className="th">Professione</th>
            <th className="th">Email</th><th className="th">Telefono</th><th className="th">Prodotto richiesto</th><th className="th">Marketing</th>
            {!lead && <th className="th">Proprietario</th>}
          </tr></thead>
          <tbody>
            {data.items.map((p) => (
              <tr key={p.id} className="cursor-pointer hover:bg-[#0a3b7c]/[0.03]" onClick={() => nav(`/persone/${p.id}`)} data-testid={`person-row-${p.id}`}>
                {lead && (
                  <td className="td" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      <button className="btn-gold h-7 px-2.5 text-xs" onClick={() => take(p)} data-testid={`button-prendo-io-${p.id}`}><Hand className="h-3.5 w-3.5" />Prendo io</button>
                      {isAdmin && (
                        <select className="crm-select h-7 text-xs" value="" onChange={(e) => e.target.value && assign(p, e.target.value)} data-testid={`assign-select-${p.id}`}>
                          <option value="">Assegna…</option>
                          {team.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
                        </select>
                      )}
                    </div>
                  </td>
                )}
                <td className="td"><LabelList labels={p.etichette} /></td>
                <td className="td">{fmtDate(p.primo_contatto)}</td>
                <td className="td text-slate-500">{fmtDateTime(p.updated_at)}</td>
                <td className="td font-medium text-slate-900">{p.full_name}</td>
                <td className="td">{p.professione}</td>
                <td className="td text-[#0a3b7c]">{p.email}</td>
                <td className="td text-[#0a3b7c]">{p.telefono}</td>
                <td className="td max-w-[200px] truncate">{p.prodotto_richiesto}</td>
                <td className="td">{p.tipo_marketing}</td>
                {!lead && <td className="td">{userName(p.owner_id) || <span className="text-slate-400">{p.owner_import || "—"}</span>}</td>}
              </tr>
            ))}
            {!data.items.length && <tr><td colSpan={10} className="p-10 text-center text-sm text-slate-500" data-testid="persons-empty">{lead ? "Nessun lead da assegnare. Ottimo lavoro!" : "Nessun contatto trovato"}</td></tr>}
          </tbody>
        </table>
      </div>
      <PersonDialog open={open} onOpenChange={setOpen} onSaved={(p) => nav(`/persone/${p.id}`)} />
    </div>
  );
};

const OrgsTable = () => {
  const { userName } = useApp();
  const nav = useNavigate();
  const [data, setData] = useState({ items: [], total: 0 });
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({});
  const load = useCallback(() => api.get("/organizations", { params: { q, page } }).then((r) => setData(r.data)), [q, page]);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    try { const r = await api.post("/organizations", f); setOpen(false); nav(`/organizzazioni/${r.data.id}`); }
    catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="min-w-0 flex-1 p-5 fade-in">
      <div className="mb-3 flex items-center gap-2">
        <button className="btn-primary" onClick={() => { setF({}); setOpen(true); }} data-testid="add-org-btn"><Plus className="h-4 w-4" />Organizzazione</button>
        <input className="crm-input w-64" placeholder="Filtra per nome" value={q} onChange={(e) => setQ(e.target.value)} data-testid="orgs-filter-input" />
        <div className="ml-auto flex items-center gap-4"><span className="text-sm font-semibold">{data.total} organizzazioni</span><Pager page={page} setPage={setPage} total={data.total} limit={50} /></div>
      </div>
      <div className="overflow-auto rounded-md border border-slate-200 bg-white">
        <table className="w-full border-collapse" data-testid="orgs-table">
          <thead><tr><th className="th">Nome</th><th className="th">Città</th><th className="th">Telefono</th><th className="th">Email</th><th className="th">Persone</th><th className="th">Proprietario</th></tr></thead>
          <tbody>
            {data.items.map((o) => (
              <tr key={o.id} className="cursor-pointer hover:bg-slate-50" onClick={() => nav(`/organizzazioni/${o.id}`)} data-testid={`org-row-${o.id}`}>
                <td className="td font-medium">{o.nome}</td><td className="td">{o.citta}</td><td className="td">{o.telefono}</td><td className="td">{o.email}</td>
                <td className="td">{o.persons_count}</td><td className="td">{userName(o.owner_id) || "—"}</td>
              </tr>
            ))}
            {!data.items.length && <tr><td colSpan={6} className="p-10 text-center text-sm text-slate-500">Nessuna organizzazione</td></tr>}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="org-dialog">
          <DialogHeader><DialogTitle className="font-display">Nuova organizzazione</DialogTitle></DialogHeader>
          {[["nome", "Nome"], ["indirizzo", "Indirizzo"], ["citta", "Città"], ["telefono", "Telefono"], ["email", "Email"]].map(([k, l]) => (
            <label key={k} className="text-xs font-medium text-slate-600">{l}<input className="crm-input mt-1" value={f[k] || ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} data-testid={`org-field-${k}`} /></label>
          ))}
          <div className="flex justify-end"><button className="btn-primary" onClick={save} data-testid="org-save-btn">Salva</button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default function ContactsPage({ view }) {
  const [counts, setCounts] = useState(null);
  const reloadCounts = useCallback(() => api.get("/persons/counts").then((r) => setCounts(r.data)), []);
  useEffect(() => { reloadCounts(); }, [reloadCounts, view]);
  return (
    <div className="flex min-h-full">
      <SubNav counts={counts} />
      {view === "organizations" ? <OrgsTable /> : <PersonsTable view={view === "da_assegnare" ? "da_assegnare" : "all"} reloadCounts={reloadCounts} />}
    </div>
  );
}
