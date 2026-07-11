"use client";

import { Button } from "@/components/ui/button";
import type { ReviewSection } from "@/lib/onboarding/review-summary";

export function OnboardingReview({
  sections,
  editLabel,
  noValue,
  onEdit
}: {
  sections: ReviewSection[];
  editLabel: string;
  noValue: string;
  onEdit: (step: ReviewSection["step"]) => void;
}) {
  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <section key={section.id} className="rounded-xl border border-border/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">{section.title}</h3>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onEdit(section.step)}>
              {editLabel}
            </Button>
          </div>
          {section.rows.length ? (
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              {section.rows.map((item) => (
                <div key={`${section.id}-${item.label}`} className="min-w-0 rounded-lg bg-muted/35 p-3">
                  <dt className="font-medium text-foreground">{item.label}</dt>
                  <dd className="mt-1 break-words text-muted-foreground">{item.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">{noValue}</p>
          )}
        </section>
      ))}
    </div>
  );
}
