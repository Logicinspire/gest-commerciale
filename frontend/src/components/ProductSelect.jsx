import { useApp } from "@/context/AppContext";
import { fmtMoney } from "@/lib/constants";

export const ProductSelect = ({ value, onChange, testid = "product-select", className = "crm-select w-full" }) => {
  const { products } = useApp();
  return (
    <select className={className} value={value || ""} onChange={(e) => onChange(products.find((p) => p.id === e.target.value) || null)} data-testid={testid}>
      <option value="">— Seleziona prodotto —</option>
      {products.map((p) => <option key={p.id} value={p.id}>{p.nome} · {fmtMoney(p.prezzo)} ({p.erogatore})</option>)}
    </select>
  );
};

export const ProductMulti = ({ value = [], onChange }) => {
  const { products } = useApp();
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="max-h-48 overflow-auto rounded-md border border-slate-300 bg-white" data-testid="deal-products">
      {products.map((p) => (
        <label key={p.id} className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-3 py-1.5 text-sm last:border-0 hover:bg-slate-50">
          <input type="checkbox" checked={value.includes(p.id)} onChange={() => toggle(p.id)} data-testid={`deal-product-${p.id}`} className="accent-[#0a3b7c]" />
          <span className="flex-1">{p.nome}</span>
          <span className="text-xs text-slate-500">{p.tipo} · {p.erogatore}</span>
          <span className="w-20 text-right font-mono text-xs">{fmtMoney(p.prezzo)}</span>
        </label>
      ))}
    </div>
  );
};
