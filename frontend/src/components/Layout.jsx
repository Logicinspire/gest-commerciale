import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { UserButton } from "@clerk/react";
import { Contact, CircleDollarSign, CalendarCheck, Upload, Users, Plug, Search, User, Building2, Inbox } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";

const NAV = [
  { to: "/contatti", label: "Contatti", Icon: Contact, id: "contatti", match: ["/contatti", "/persone", "/organizzazioni"] },
  { to: "/affari", label: "Affari", Icon: CircleDollarSign, id: "affari" },
  { to: "/attivita", label: "Attività", Icon: CalendarCheck, id: "attivita" },
];
const ADMIN_NAV = [
  { to: "/importa", label: "Importa da Pipedrive", Icon: Upload, id: "importa" },
  { to: "/utenti", label: "Utenti", Icon: Users, id: "utenti" },
  { to: "/integrazioni", label: "Collegamenti", Icon: Plug, id: "integrazioni" },
];

const SideItem = ({ item }) => {
  const loc = useLocation();
  const active = (item.match || [item.to]).some((m) => loc.pathname.startsWith(m));
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink to={item.to} data-testid={`nav-link-${item.id}`}
          className={`flex h-11 w-11 items-center justify-center rounded-lg transition-colors ${active ? "bg-[#0a3b7c] text-white shadow-[inset_3px_0_0_#C9A227]" : "text-slate-400 hover:bg-[#102d57] hover:text-white"}`}>
          <item.Icon className="h-5 w-5" strokeWidth={1.8} />
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
};

const GlobalSearch = () => {
  const [q, setQ] = useState("");
  const [res, setRes] = useState(null);
  const nav = useNavigate();
  const box = useRef(null);
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return; }
    const t = setTimeout(() => api.get("/search", { params: { q } }).then((r) => setRes(r.data)), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const h = (e) => box.current && !box.current.contains(e.target) && setRes(null);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const go = (path) => { setQ(""); setRes(null); nav(path); };
  const empty = res && !res.persons.length && !res.organizations.length && !res.deals.length;
  return (
    <div className="relative w-full max-w-md" ref={box}>
      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
      <input data-testid="global-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca contatti, telefono, email, affari…"
        className="h-9 w-full rounded-full border border-slate-300 bg-white pl-9 pr-4 text-sm outline-none focus:border-[#0a3b7c]" />
      {res && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl" data-testid="global-search-results">
          {empty && <div className="px-4 py-3 text-sm text-slate-500">Nessun risultato</div>}
          {res.persons.map((p) => (
            <button key={p.id} onClick={() => go(`/persone/${p.id}`)} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-slate-50" data-testid={`search-person-${p.id}`}>
              <User className="h-4 w-4 text-slate-400" /> <span className="font-medium">{p.full_name}</span>
              <span className="truncate text-xs text-slate-500">{p.email} {p.telefono}</span>
            </button>
          ))}
          {res.organizations.map((o) => (
            <button key={o.id} onClick={() => go(`/organizzazioni/${o.id}`)} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-slate-50">
              <Building2 className="h-4 w-4 text-slate-400" /> {o.nome}
            </button>
          ))}
          {res.deals.map((d) => (
            <button key={d.id} onClick={() => go(d.person_id ? `/persone/${d.person_id}` : "/affari")} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-slate-50">
              <CircleDollarSign className="h-4 w-4 text-slate-400" /> {d.titolo} <span className="text-xs text-slate-500">· {d.fase}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const TITLES = [["/contatti", "Contatti"], ["/persone", "Contatti / Persone"], ["/organizzazioni", "Contatti / Organizzazioni"], ["/affari", "Affari"],
  ["/attivita", "Attività"], ["/importa", "Importa da Pipedrive"], ["/utenti", "Utenti"], ["/integrazioni", "Collegamenti"]];

export default function Layout({ children }) {
  const { isAdmin, me } = useApp();
  const loc = useLocation();
  const title = TITLES.find(([p]) => loc.pathname.startsWith(p))?.[1] || "";
  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-screen overflow-hidden">
        <aside className="flex w-16 shrink-0 flex-col items-center gap-2 bg-[#071c38] py-3" data-testid="sidebar">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[#C9A227] font-display text-lg font-bold text-[#071c38]">IC</div>
          {NAV.map((i) => <SideItem key={i.id} item={i} />)}
          {isAdmin && <div className="my-2 h-px w-8 bg-slate-700" />}
          {isAdmin && ADMIN_NAV.map((i) => <SideItem key={i.id} item={i} />)}
          <div className="mt-auto" data-testid="user-menu"><UserButton /></div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-6 border-b border-slate-200 bg-white px-5">
            <div className="min-w-[200px] font-display text-lg font-semibold text-slate-900" data-testid="page-title">{title}</div>
            <div className="flex flex-1 justify-center"><GlobalSearch /></div>
            <div className="flex items-center gap-2 text-sm text-slate-600" data-testid="current-user">
              <Inbox className="h-4 w-4 text-[#C9A227]" />
              <span className="font-medium text-slate-800">{me.name}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] uppercase tracking-wide">{me.role}</span>
            </div>
          </header>
          <main className="min-h-0 flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}
