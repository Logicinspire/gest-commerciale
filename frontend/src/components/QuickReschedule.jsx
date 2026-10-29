import { CalendarClock } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { PRESETS, presetDate, fmtDate } from "@/lib/constants";

export const QuickReschedule = ({ activity, onDone }) => {
  const move = async (key) => {
    try {
      const data = presetDate(key);
      await api.patch(`/activities/${activity.id}`, { data, done: false });
      toast.success(`Richiamo spostato al ${fmtDate(data, "d MMM yyyy")}`);
      onDone?.();
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 hover:border-[#0a3b7c] hover:text-[#0a3b7c]"
          data-testid={`quick-reschedule-${activity.id}`}>
          <CalendarClock className="h-3.5 w-3.5" />Richiama
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs">Sposta a…</DropdownMenuLabel>
        {PRESETS.map((p) => (
          <DropdownMenuItem key={p.key} onClick={() => move(p.key)} data-testid={`reschedule-${p.key}-${activity.id}`}>{p.label}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
