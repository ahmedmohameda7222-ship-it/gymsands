import type { PromptLanguage } from "@/lib/ai/quick-prompts";

export const promptSurfaceCopy = {
  en: {
    recommendedForDay: "Recommended for this day",
    nutrition: "Nutrition",
    mealActions: "Adjust this planned meal",
    mealDescription: "Choose a focused professional adjustment for the selected meal.",
    browseAll: "Browse all prompts"
  },
  de: {
    recommendedForDay: "Für diesen Tag empfohlen",
    nutrition: "Ernährung",
    mealActions: "Diese geplante Mahlzeit anpassen",
    mealDescription: "Wähle eine gezielte professionelle Anpassung für die ausgewählte Mahlzeit.",
    browseAll: "Alle Prompts durchsuchen"
  },
  ar: {
    recommendedForDay: "مقترح لهذا اليوم",
    nutrition: "التغذية",
    mealActions: "تعديل هذه الوجبة المخططة",
    mealDescription: "اختر تعديلًا مهنيًا ومحددًا للوجبة المختارة.",
    browseAll: "تصفح كل الطلبات"
  }
} satisfies Record<PromptLanguage, Record<string, string>>;
