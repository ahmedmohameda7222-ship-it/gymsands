"use client";

import { useEffect } from "react";

function normalizedText(element: Element) {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function findTab(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button[role="tab"], button[data-state]')).find(
    (button) => normalizedText(button) === label
  );
}

function findFoodNameInput() {
  return document.querySelector<HTMLInputElement>('input[placeholder="Food name"]');
}

function scrollToShoppingList() {
  const shoppingList = document.getElementById("shopping-list");
  if (!shoppingList) return;

  shoppingList.scrollIntoView({ block: "start", behavior: "smooth" });
}

export function MealPlanAddButtonBridge() {
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const actionElement = target.closest("button, a");
      if (!actionElement) return;

      const text = normalizedText(actionElement);

      if (text === "add planned meal") {
        window.requestAnimationFrame(() => {
          findTab("day")?.click();

          window.requestAnimationFrame(() => {
            const foodNameInput = findFoodNameInput();
            if (!foodNameInput) return;

            foodNameInput.scrollIntoView({ block: "center", behavior: "smooth" });
            foodNameInput.focus({ preventScroll: true });
          });
        });
        return;
      }

      if (text === "shopping list") {
        event.preventDefault();

        window.requestAnimationFrame(() => {
          findTab("shopping")?.click();

          window.requestAnimationFrame(scrollToShoppingList);
        });
      }
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  return null;
}
