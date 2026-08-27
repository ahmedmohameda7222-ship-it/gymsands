import type { NutritionV1Key } from "@/lib/i18n/nutrition-v1";

export type FoodLibraryExtraKey =
  | "createFood"
  | "scanBarcode"
  | "nutritionIsFor"
  | "foodName"
  | "servingBasis"
  | "basisAmount"
  | "basisUnit"
  | "saveFood"
  | "saveCorrection"
  | "customFoodSaveFailed"
  | "possibleDuplicate"
  | "useExisting"
  | "correctForMe"
  | "createSeparately"
  | "deleteFood"
  | "deleteFoodConfirmation"
  | "editFood"
  | "searchStillAvailable"
  | "personalCorrection"
  | "foodManagement"
  | "customFoodDeleted";

export type FoodLibraryTextKey = NutritionV1Key | FoodLibraryExtraKey;
type Language = "en" | "de" | "ar";
type Values = Record<string, string | number>;

const extra: Record<Language, Record<FoodLibraryExtraKey, string>> = {
  en: {
    createFood: "Create Food",
    scanBarcode: "Scan",
    nutritionIsFor: "Nutrition is for",
    foodName: "Food name",
    servingBasis: "Serving",
    basisAmount: "Basis amount",
    basisUnit: "Basis unit",
    saveFood: "Save Food",
    saveCorrection: "Save correction",
    customFoodSaveFailed: "Food could not be saved.",
    possibleDuplicate: "Possible duplicate",
    useExisting: "Use Existing",
    correctForMe: "Correct for me",
    createSeparately: "Create Separately",
    deleteFood: "Delete Food",
    deleteFoodConfirmation: "Delete this Food from future discovery? Historical frozen nutrition remains unchanged.",
    editFood: "Edit Food",
    searchStillAvailable: "Search remains available.",
    personalCorrection: "Personal correction",
    foodManagement: "Food management",
    customFoodDeleted: "Food removed from future discovery.",
  },
  de: {
    createFood: "Lebensmittel erstellen",
    scanBarcode: "Scannen",
    nutritionIsFor: "Nährwerte gelten für",
    foodName: "Lebensmittelname",
    servingBasis: "Portion",
    basisAmount: "Bezugsmenge",
    basisUnit: "Bezugseinheit",
    saveFood: "Lebensmittel speichern",
    saveCorrection: "Korrektur speichern",
    customFoodSaveFailed: "Das Lebensmittel konnte nicht gespeichert werden.",
    possibleDuplicate: "Mögliches Duplikat",
    useExisting: "Vorhandenes verwenden",
    correctForMe: "Für mich korrigieren",
    createSeparately: "Separat erstellen",
    deleteFood: "Lebensmittel löschen",
    deleteFoodConfirmation: "Dieses Lebensmittel aus der zukünftigen Suche entfernen? Historisch eingefrorene Nährwerte bleiben unverändert.",
    editFood: "Lebensmittel bearbeiten",
    searchStillAvailable: "Die Suche bleibt verfügbar.",
    personalCorrection: "Persönliche Korrektur",
    foodManagement: "Lebensmittel verwalten",
    customFoodDeleted: "Lebensmittel aus der zukünftigen Suche entfernt.",
  },
  ar: {
    createFood: "إنشاء طعام",
    scanBarcode: "مسح الباركود",
    nutritionIsFor: "القيم الغذائية تخص",
    foodName: "اسم الطعام",
    servingBasis: "الحصة",
    basisAmount: "كمية الأساس",
    basisUnit: "وحدة الأساس",
    saveFood: "حفظ الطعام",
    saveCorrection: "حفظ التصحيح",
    customFoodSaveFailed: "تعذر حفظ الطعام.",
    possibleDuplicate: "تطابق محتمل",
    useExisting: "استخدام الموجود",
    correctForMe: "تصحيح لي",
    createSeparately: "إنشاء بشكل منفصل",
    deleteFood: "حذف الطعام",
    deleteFoodConfirmation: "إزالة هذا الطعام من الاستخدام المستقبلي؟ تظل القيم الغذائية التاريخية المجمدة دون تغيير.",
    editFood: "تعديل الطعام",
    searchStillAvailable: "البحث ما زال متاحًا.",
    personalCorrection: "تصحيح شخصي",
    foodManagement: "إدارة الطعام",
    customFoodDeleted: "تمت إزالة الطعام من الاستخدام المستقبلي.",
  },
};

export function foodLibraryText(
  language: Language,
  base: (key: NutritionV1Key, values?: Values) => string,
  key: FoodLibraryTextKey,
  values?: Values,
) {
  const template = extra[language][key as FoodLibraryExtraKey];
  if (!template) return base(key as NutritionV1Key, values);
  if (!values) return template;
  return Object.entries(values).reduce((result, [name, value]) => result.replaceAll(`{${name}}`, String(value)), template);
}
