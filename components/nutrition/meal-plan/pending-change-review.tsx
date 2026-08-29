"use client";

import { useNutritionV1Translation } from "@/lib/i18n/nutrition-v1";

type PendingRequest = {
  id: string;
  base_revision: number;
  proposal_json: Record<string, unknown>;
  state: string;
};

export function PendingChangeReview({ requests, stale, onApprove, onCancel }: {
  requests: PendingRequest[];
  stale: boolean;
  onApprove: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const { nt, dir } = useNutritionV1Translation();
  if (!requests.length && !stale) return null;
  return (
    <section dir={dir} className="border-b border-border py-4" aria-labelledby="pending-plan-changes">
      <h2 id="pending-plan-changes" className="font-semibold">{nt("pendingChatGptChanges")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{nt("pendingChatGptDescription")}</p>
      {stale ? <p role="status" className="mt-3 text-sm font-medium">{nt("staleProposal")}</p> : null}
      <div className="mt-3 divide-y divide-border">{requests.map((request) => (
        <div key={request.id} className="py-3">
          <pre dir="ltr" className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-muted p-3 text-xs">{JSON.stringify(request.proposal_json, null, 2)}</pre>
          <div className="mt-2 flex gap-2"><button type="button" onClick={() => onApprove(request.id)} className="min-h-11 rounded-xl bg-foreground px-4 text-sm font-semibold text-background">{nt("approveAll")}</button><button type="button" onClick={() => onCancel(request.id)} className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium">{nt("cancel")}</button></div>
        </div>
      ))}</div>
    </section>
  );
}
