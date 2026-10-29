import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const split = (value, basi) => {
  const base = basi.find((b) => (value || "").startsWith(b));
  return base ? { base, spec: value.slice(base.length).trim() } : { base: value ? "Altro" : "", spec: value || "" };
};

export const ProfessionField = ({ value, onChange }) => {
  const [data, setData] = useState({ basi: ["Ingegnere", "Architetto", "Geometra", "Perito"], specializzazioni: [] });
  useEffect(() => { api.get("/professioni").then((r) => setData(r.data)).catch(() => {}); }, []);
  const { base, spec } = split(value, data.basi);
  const emit = (b, s) => onChange(b === "Altro" ? s : [b, s].filter(Boolean).join(" ").trim());
  const specs = data.specializzazioni.filter((x) => x.base === base);
  return (
    <div className="mt-1 flex gap-1.5">
      <select className="crm-select w-32 shrink-0" value={base} onChange={(e) => emit(e.target.value, e.target.value === "Altro" ? spec : "")} data-testid="person-field-professione">
        <option value="">—</option>
        {data.basi.map((b) => <option key={b}>{b}</option>)}
        <option value="Altro">Altro</option>
      </select>
      {base && (
        <>
          <input className="crm-input" list="prof-specs" placeholder={base === "Altro" ? "Professione" : "Specializzazione (es. elettrico)"} value={spec}
            onChange={(e) => emit(base, e.target.value)} data-testid="person-field-professione-spec" />
          <datalist id="prof-specs">{specs.map((s) => <option key={s.nome} value={s.spec} />)}</datalist>
        </>
      )}
    </div>
  );
};
