"use client";

import { ExerciseDetailPageFrame, DetailGroupTitle, DetailSurface } from "@/components/exercise-detail/detail-ui";
import { useExerciseDetail } from "@/components/exercise-detail/exercise-detail-provider";
import { useExerciseDetailTranslation } from "@/lib/i18n/exercise-detail";

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return <div className="grid gap-1 py-2.5 sm:grid-cols-[12rem_1fr] sm:gap-4"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>;
}

function localizedRequirement(requirement: string | null, language: "en" | "de" | "ar", required: string, optional: string) {
  if (requirement === "required") return required;
  if (requirement === "optional") return optional;
  if (requirement === "compatible") return language === "de" ? "Kompatibel" : language === "ar" ? "متوافق" : "Compatible";
  // Unknown canonical requirements stay internal until a reviewed localized label exists.
  return null;
}

function authoritativeFieldLabels(fields: Array<Record<string, unknown>> | undefined) {
  return (fields ?? []).flatMap((field) => typeof field.label === "string" && field.label.trim() ? [field.label.trim()] : []);
}

export default function ExerciseTechnicalDetailsPage() {
  const { state, resolved } = useExerciseDetail();
  const { language, ed } = useExerciseDetailTranslation();
  const exercise = state === "ready" ? resolved?.core ?? null : null;
  const trackingLabels = resolved?.catalog
    ? [...authoritativeFieldLabels(resolved.catalog.detail.prescriptionSchema?.fields), ...authoritativeFieldLabels(resolved.catalog.detail.performedMetricSchema?.fields)]
        .filter((value, index, all) => all.indexOf(value) === index)
    : [];
  return <ExerciseDetailPageFrame child="details" title={ed("detailsTitle")}>
    {exercise ? <DetailSurface ariaLabelledby="technical-detail-surface">
      <DetailGroupTitle id="technical-detail-surface">{ed("classification")}</DetailGroupTitle>
      <dl className="mt-3 divide-y"><Row label={ed("movement")} value={exercise.movementPattern} /><Row label={ed("mechanics")} value={exercise.mechanics} /><Row label={ed("force")} value={exercise.forceType} /><Row label={ed("difficulty")} value={exercise.difficulty} /><Row label={ed("activityType")} value={exercise.activityType} /></dl>
      {exercise.equipment.length ? <section className="mt-5 border-t pt-5"><h3 className="font-semibold">{ed("equipment")}</h3><div className="mt-3 divide-y">{exercise.equipment.map((item, index) => {
        const requirement = localizedRequirement(item.requirement, language, ed("required"), ed("optional"));
        return <div key={`${item.slug ?? item.name}-${index}`} className="flex items-center justify-between gap-4 py-3"><span className="font-medium">{item.name}</span>{requirement ? <span className="text-sm text-muted-foreground">{requirement}</span> : null}</div>;
      })}</div></section> : null}
      {trackingLabels.length ? <section className="mt-5 border-t pt-5"><h3 className="font-semibold">{ed("whatYouTrack")}</h3><div className="mt-3 flex flex-wrap gap-2">{trackingLabels.map((label) => <span key={label} className="rounded-lg border px-3 py-2 text-sm">{label}</span>)}</div></section> : null}
    </DetailSurface> : null}
  </ExerciseDetailPageFrame>;
}
