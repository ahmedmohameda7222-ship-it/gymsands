import type { ReactNode } from "react";

export type HistoryFact = {
  label?: ReactNode;
  value: ReactNode;
};

export function HistoryFactList({ facts, separator = " / " }: { facts: HistoryFact[]; separator?: string }) {
  return (
    <span data-history-fact-list>
      {facts.map((fact, index) => (
        <span key={index} data-history-fact>
          {index > 0 ? <span aria-hidden="true">{separator}</span> : null}
          {fact.label ? <span>{fact.label}: </span> : null}
          <bdi dir="ltr">{fact.value}</bdi>
        </span>
      ))}
    </span>
  );
}
