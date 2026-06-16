"use client";

import { useEffect } from "react";

const removedCopy = [
  "Nutrition values are approximate and may vary depending on preparation and portion size.",
  "Fast logging uses saved foods, recent history, favorites, recipes, and manual entries you create. Use Done now for real food logs; Add to plan only schedules a meal."
];

function normalizedText(element: Element) {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

function removeNutritionCopy() {
  const matchingParagraph = Array.from(document.querySelectorAll("p")).find((paragraph) =>
    removedCopy.some((copy) => normalizedText(paragraph) === copy)
  );

  const card = matchingParagraph?.closest(".bg-muted\\/40, .rounded-lg, .rounded-md, .border");
  card?.remove();
}

export function NutritionCopyCleanup() {
  useEffect(() => {
    removeNutritionCopy();

    const observer = new MutationObserver(removeNutritionCopy);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
