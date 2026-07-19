import type { AdvancedHeatLevel } from "@/lib/train/muscle-intelligence/advanced-exposure";

export type MuscleHeatMapLabels = {
  frontView: string;
  backView: string;
  loading: string;
  empty: string;
  partial: string;
  unavailable: string;
  error: string;
  noSelection: string;
  close: string;
  detailedRegionalMappingUnavailable: string;
  additionalBroadMappedContributionIncluded: string;
  heat: Record<AdvancedHeatLevel, string>;
  previewRole: Record<"primary" | "co_primary" | "secondary" | "stabilizer" | "none", string>;
  targetName: (translationKey: string) => string;
  targetSubtitle: (translationKey: string | null) => string | null;
  broadTargetName: (broadMuscleId: string) => string;
};

type DetailsPanelProps = {
  name: string | null;
  subtitle: string | null;
  status: string | null;
  compatibilityDisclosure: string | null;
  onClose: () => void;
  labels: MuscleHeatMapLabels;
};

export function MuscleDetailsPanel({ name, subtitle, status, compatibilityDisclosure, onClose, labels }: DetailsPanelProps) {
  return (
    <div className="relative min-h-24 rounded-2xl border border-border/70 bg-card p-4 text-card-foreground" aria-live="polite">
      {name ? (
        <>
          <button type="button" className="absolute end-2 top-2 min-h-11 rounded-xl px-3 text-sm font-medium text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onClose}>
            {labels.close}
          </button>
          <p className="pe-20 font-semibold">{name}</p>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
          {status ? <p className="mt-3 text-sm font-medium">{status}</p> : null}
          {compatibilityDisclosure ? <p className="mt-2 text-sm text-muted-foreground">{compatibilityDisclosure}</p> : null}
        </>
      ) : <p className="text-sm text-muted-foreground">{labels.noSelection}</p>}
    </div>
  );
}
