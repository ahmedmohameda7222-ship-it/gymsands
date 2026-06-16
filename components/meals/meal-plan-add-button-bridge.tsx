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

function openAddPlannedMeal() {
  window.requestAnimationFrame(() => {
    findTab("day")?.click();

    window.requestAnimationFrame(() => {
      const foodNameInput = findFoodNameInput();
      if (!foodNameInput) return;

      foodNameInput.scrollIntoView({ block: "center", behavior: "smooth" });
      foodNameInput.focus({ preventScroll: true });
    });
  });
}

function openShoppingList() {
  window.requestAnimationFrame(() => {
    findTab("shopping")?.click();

    window.requestAnimationFrame(() => {
      scrollToShoppingList();
      window.setTimeout(scrollToShoppingList, 80);
    });
  });
}

function isShoppingListLink(element: Element) {
  if (normalizedText(element) === "shopping list") return true;
  if (!(element instanceof HTMLAnchorElement)) return false;
  return element.hash === "#shopping-list" || element.getAttribute("href") === "#shopping-list";
}

export function MealPlanAddButtonBridge() {
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const actionElement = target.closest("button, a");
      if (!actionElement) return;

      if (normalizedText(actionElement) === "add planned meal") {
        openAddPlannedMeal();
        return;
      }

      if (isShoppingListLink(actionElement)) {
        event.preventDefault();
        openShoppingList();
      }
    }

    function handleHashChange() {
      if (window.location.hash === "#shopping-list") openShoppingList();
    }

    document.addEventListener("click", handleClick, true);
    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();

    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  return null;
}
