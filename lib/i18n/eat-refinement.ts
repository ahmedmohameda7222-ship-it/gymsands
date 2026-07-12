"use client";

import { useCallback } from "react";
import { useTranslation } from "@/lib/i18n/use-translation";

const en = {
  adjustWithChatGpt: "Adjust with ChatGPT",
  previousItems: "Previous foods",
  nextItems: "Next foods",
  macroContributionLogged: "Macro calorie contribution for logged days"
} as const;
export type EatRefinementKey = keyof typeof en;
type Dictionary = Record<EatRefinementKey, string>;
const de: Dictionary = {
  adjustWithChatGpt: "Mit ChatGPT anpassen",
  previousItems: "Vorherige Lebensmittel",
  nextItems: "Nächste Lebensmittel",
  macroContributionLogged: "Kalorienbeitrag der Makros an protokollierten Tagen"
};
const ar: Dictionary = {
  adjustWithChatGpt: "التعديل باستخدام ChatGPT",
  previousItems: "الأطعمة السابقة",
  nextItems: "الأطعمة التالية",
  macroContributionLogged: "مساهمة الماكروز في السعرات للأيام المسجلة"
};
export function useEatRefinementTranslation() {
  const { language } = useTranslation();
  const dictionary = language === "de" ? de : language === "ar" ? ar : en;
  const ert = useCallback((key: EatRefinementKey) => dictionary[key], [dictionary]);
  return { ert };
}
