import { useEffect, useRef, useState } from "react";
import { X, User } from "lucide-react";
import { api } from "@/lib/api";

export const PersonPicker = ({ value, onChange, testid = "person-picker" }) => {
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (q.trim().length < 2) { setItems([]); return; }
    const t = setTimeout(() => api.get("/search", { params: { q } }).then((r) => { setItems(r.data.persons); setOpen(true); }), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const h = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  if (value) {
    return (
      <div className="flex h-9 items-center justify-between rounded-md border border-slate-300 bg-white px-2 text-sm" data-testid={`${testid}-selected`}>
        <span className="flex items-center gap-1.5 rounded bg-slate-100 px-2 py-0.5"><User className="h-3.5 w-3.5" />{value.full_name}</span>
        <button type="button" onClick={() => onChange(null)} data-testid={`${testid}-clear`}><X className="h-4 w-4 text-slate-500" /></button>
      </div>
    );
  }
  return (
    <div className="relative" ref={box}>
      <input className="crm-input" placeholder="Cerca persona per nome, email o telefono" value={q} onChange={(e) => setQ(e.target.value)} data-testid={testid} />
      {open && items.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-white shadow-lg">
          {items.map((p) => (
            <button type="button" key={p.id} onClick={() => { onChange(p); setQ(""); setOpen(false); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
              data-testid={`${testid}-option-${p.id}`}>
              <div className="font-medium">{p.full_name}</div><div className="text-xs text-slate-500">{p.email} {p.telefono}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
