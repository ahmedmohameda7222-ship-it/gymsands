"use client";

import { useEffect } from "react";

function normalizedButtonText(element: Element) {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function findDayTab() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button[role="tab"], button[data-state]')).find(
    (button) => normalizedButtonText(button) === "day"
  );
}

function findFoodNameInput() {
  return document.querySelector<HTMLInputElement>('input[placeholder="Food name"]');
}

export function MealPlanAddButtonBridge() {
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const button = target.closest("button");
      if (!button || normalizedButtonText(button) !== "add planned meal") return;

      window.requestAnimationFrame(() => {
        findDayTab()?.click();

        window.requestAnimationFrame(() => {
          const foodNameInput = findFoodNameInput();
          if (!foodNameInput) return;

          foodNameInput.scrollIntoView({ block: "center", behavior: "smooth" });
          foodNameInput.focus({ preventScroll: true });
        });
      });
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  return null;
}
