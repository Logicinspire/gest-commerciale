import { useEffect, useRef, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { PersonPicker } from "@/components/PersonPicker";

export const BuilderDialog = ({ open, onOpenChange, person, deal, onSent }) => {
  const { config } = useApp();
  const [picked, setPicked] = useState(null);
  const [link, setLink] = useState(null);
  const contact = person || picked;
  const ctx = useRef({});
  const origin = link ? new URL(link).origin : new URL(config.contratti_url || "https://contratti.italiacorsi.it").origin;

  useEffect(() => { if (!open) { setLink(null); setPicked(null); } }, [open]);
  useEffect(() => {
    if (!open || !contact) return;
    setLink(null);
    api.post("/contratti/link-builder", { person_id: contact.id, deal_id: deal?.id || null })
      .then((r) => { ctx.current = { person_id: contact.id, deal_id: r.data.crm_deal_id }; setLink(r.data.url); })
      .catch((e) => { toast.error(errMsg(e)); onOpenChange(false); });
  }, [open, contact?.id, deal?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    const onMsg = async (ev) => {
      if (ev.origin !== origin || !ev.data || typeof ev.data !== "object") return;
      if (ev.data.tipo === "chiudi") onOpenChange(false);
      if (ev.data.tipo === "proposta_inviata") {
        try {
          const r = await api.post("/contratti/builder-inviata", { person_id: ctx.current.person_id, deal_id: ev.data.crm_deal_id || ctx.current.deal_id || null,
            proposta_id: String(ev.data.proposta_id), link_cliente: ev.data.link_cliente || null });
          toast.success("Proposta inviata al cliente");
          onOpenChange(false);
          onSent?.(r.data.deal_id);
        } catch (e) { toast.error(errMsg(e)); }
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [open, origin, onOpenChange, onSent]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-w-[96vw] flex-col gap-0 p-0 [&>button]:hidden" data-testid="builder-dialog">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-2.5">
          <DialogTitle className="font-display text-base">{deal ? `Nuova proposta · ${deal.titolo}` : "Nuovo affare · builder proposta"}</DialogTitle>
          {contact && <span className="text-sm text-slate-500" data-testid="builder-contact">{contact.full_name} · {contact.email}</span>}
          <button className="ml-auto rounded p-1 hover:bg-slate-100" onClick={() => onOpenChange(false)} data-testid="builder-close"><X className="h-5 w-5" /></button>
        </div>
        {!contact ? (
          <div className="mx-auto mt-10 w-full max-w-md text-sm">
            <div className="mb-2 font-medium">Per quale contatto è la proposta?</div>
            <PersonPicker value={picked} onChange={setPicked} testid="builder-person-picker" />
          </div>
        ) : link ? (
          <iframe title="Builder proposta" src={link} className="min-h-0 flex-1 border-0" allow="clipboard-write" data-testid="builder-iframe" />
        ) : (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Apro il builder di contratti…</div>
        )}
      </DialogContent>
    </Dialog>
  );
};
