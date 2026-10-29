import { Check, Tag } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LABEL_COLORS } from "@/lib/constants";

export const LabelPill = ({ label }) => (
  <span className={`inline-flex items-center rounded border px-1.5 py-[1px] text-[10.5px] font-bold uppercase tracking-wide ${LABEL_COLORS[label] || "border-slate-200 bg-slate-100 text-slate-700"}`}>
    {label}
  </span>
);

export const LabelList = ({ labels = [], max = 2 }) => (
  <div className="flex items-center gap-1">
    {labels.slice(0, max).map((l) => <LabelPill key={l} label={l} />)}
    {labels.length > max && <span className="rounded bg-slate-100 px-1.5 text-[11px] text-slate-600">+{labels.length - max}</span>}
  </div>
);

export const LabelPicker = ({ value = [], onChange, testid = "label-picker" }) => {
  const toggle = (l) => onChange(value.includes(l) ? value.filter((x) => x !== l) : [...value, l]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" data-testid={testid} className="flex min-h-[28px] flex-wrap items-center gap-1 rounded px-1 text-left hover:bg-slate-100">
          {value.length ? value.map((l) => <LabelPill key={l} label={l} />) : <span className="flex items-center gap-1 text-sm text-[#0a3b7c]"><Tag className="h-3.5 w-3.5" />Aggiungi etichetta</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1" align="start">
        {Object.keys(LABEL_COLORS).map((l) => (
          <button key={l} type="button" onClick={() => toggle(l)} data-testid={`label-option-${l.replace(/\s+/g, "-").toLowerCase()}`}
            className="flex w-full items-center justify-between rounded px-2 py-1.5 hover:bg-slate-50">
            <LabelPill label={l} />
            {value.includes(l) && <Check className="h-4 w-4 text-[#0a3b7c]" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
};
