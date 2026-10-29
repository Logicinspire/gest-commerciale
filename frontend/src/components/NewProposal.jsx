import { useApp } from "@/context/AppContext";
import { ProposalDialog } from "@/components/ProposalDialog";
import { BuilderDialog } from "@/components/BuilderDialog";

// Live: contratti builder in iframe. Sample data: in-app builder.
export const NewProposal = ({ open, onOpenChange, person, deal, onDeal, onProposal }) => {
  const { config } = useApp();
  if (config.contratti_modalita === "live") {
    return <BuilderDialog open={open} onOpenChange={onOpenChange} person={person} deal={deal} onSent={(dealId) => onDeal?.(dealId)} />;
  }
  return <ProposalDialog open={open} onOpenChange={onOpenChange} person={person} deal={deal}
    onSaved={(pr) => (onProposal ? onProposal(pr) : onDeal?.(pr.crm_deal_id))} />;
};
