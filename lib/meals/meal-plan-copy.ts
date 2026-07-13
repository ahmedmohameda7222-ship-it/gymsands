import type { SupportedLanguage } from "@/lib/i18n/types";

const en = {
  title: "My Meal Plan", description: "Plan with ChatGPT, then execute and correct each day in Plaivra.",
  updateChatGPT: "Update with ChatGPT", addMeal: "Add meal", moreActions: "More actions", foodPreferences: "Food preferences",
  day: "Day", week: "Week", shopping: "Shopping", previousDay: "Previous day", nextDay: "Next day", today: "Today",
  loadingMeals: "Loading meals…", loadMealsError: "Meals could not load.", retry: "Retry", targetUnavailable: "The nutrition target is temporarily unavailable.",
  effectiveTarget: "Effective target", scheduled: "Scheduled", consumed: "Consumed", remaining: "Remaining", overTarget: "Over target",
  protein: "Protein", carbs: "Carbs", fat: "Fat", planned: "Planned", done: "Done", skipped: "Skipped", alignment: "Plan alignment",
  groceryList: "Grocery list", openList: "Open list", itemsChecked: "{count} items · {checked} checked",
  breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snacks: "Snacks", noMeals: "No meals planned.",
  addBreakfast: "Add breakfast", addLunch: "Add lunch", addDinner: "Add dinner", addSnack: "Add snack", toggleSection: "Expand or collapse {meal}",
  quantityServing: "{quantity} × {serving}", markDone: "Done", saving: "Saving…", adjust: "Meal actions", skip: "Skip", edit: "Edit",
  addGrocery: "Add to grocery", remove: "Remove", removePlan: "Remove from plan", adjustChatGPT: "Adjust with ChatGPT",
  validationNeedsReview: "Nutrition details need review", completedCorrection: "Correct logged meal", completedCorrectionDesc: "This updates the meal plan and consumed history together.",
  addTitle: "Add a meal", addDescription: "Choose how to add a meal for {date}.", createChatGPT: "Create/update with ChatGPT", addDirectly: "Add directly", openFoodHub: "Open Food Hub",
  directTitle: "Add directly", date: "Date", foodName: "Food name", mealType: "Meal type", quantity: "Quantity", serving: "Serving", nutritionDetails: "Nutrition details",
  calories: "Calories", notes: "Notes", save: "Save meal", cancel: "Cancel", required: "This field is required.", positive: "Enter a value greater than zero.", nonNegative: "Enter zero or a positive value.",
  mealAdded: "Meal added", mealUpdated: "Meal updated", mealDone: "Meal marked done", mealAlreadyDone: "Meal was already completed; no duplicate log was created.", mealSkipped: "Meal skipped",
  groceryAdded: "Added to grocery list", groceryDuplicate: "Already in grocery list", mealRemoved: "Meal removed", actionError: "The action could not be completed.", closeNotice: "Dismiss notification",
  deleteTitle: "Delete meal?", deleteDesc: "This removes the planned meal.", removeLoggedTitle: "Remove completed meal from plan?", removeLoggedDesc: "The meal-plan row will be removed, but consumed calories remain in Eat and history.",
  previousWeek: "Previous week", nextWeek: "Next week", weekRange: "{start} – {end}", noWeekMeals: "No meals planned for this day.", target: "Target", activeCalories: "Active scheduled", consumedCalories: "Consumed",
  chatAdjustTitle: "Adjust meal with ChatGPT", chatAdjustDesc: "Choose one focused adjustment. ChatGPT receives only the authorized meal-plan context.",
  replace: "Replace", replaceDesc: "Replace this meal while preserving its date and nutrition context.",
  cheaper: "Cheaper", cheaperDesc: "Create a lower-cost alternative using saved preferences.",
  faster: "Faster", fasterDesc: "Create a quicker alternative using saved cooking constraints.",
  moreProtein: "More protein", moreProteinDesc: "Increase protein and update all nutrition values.",
  swapIngredient: "Swap ingredient", swapIngredientDesc: "Replace one ingredient while respecting allergies and preferences.",
  dairyFree: "Dairy-free", dairyFreeDesc: "Create a dairy-free version with updated nutrition values.",
  glutenFree: "Gluten-free", glutenFreeDesc: "Create a gluten-free version with updated nutrition values.",
  changeCuisine: "Change cuisine", changeCuisineDesc: "Change the cuisine while preserving the meal purpose.",
  close: "Close", statusPlanned: "Planned", statusDone: "Done", statusSkipped: "Skipped", repairCompletion: "Repair completion",
  invalidRow: "This saved row is inconsistent and cannot be used until corrected.", meals: "meals", upToDate: "Up to date",
  defaultDay: "Default day", trainingDay: "Training day", restDay: "Rest day", highActivityDay: "High activity day", baseFallback: "Base fallback",
  unexpectedTitle: "My Meal Plan could not load", unexpectedDesc: "An unexpected page error occurred. Retry the page or return to the dashboard.", dashboard: "Dashboard"
};

const de: typeof en = {
  ...en,
  title: "Mein Essensplan", description: "Mit ChatGPT planen und jeden Tag in Plaivra ausführen und korrigieren.", updateChatGPT: "Mit ChatGPT aktualisieren", addMeal: "Mahlzeit hinzufügen", moreActions: "Weitere Aktionen", foodPreferences: "Essenspräferenzen",
  day: "Tag", week: "Woche", shopping: "Einkauf", previousDay: "Vorheriger Tag", nextDay: "Nächster Tag", today: "Heute", loadingMeals: "Mahlzeiten werden geladen…", loadMealsError: "Mahlzeiten konnten nicht geladen werden.", retry: "Erneut versuchen", targetUnavailable: "Das Ernährungsziel ist vorübergehend nicht verfügbar.",
  effectiveTarget: "Aktives Ziel", scheduled: "Eingeplant", consumed: "Verzehrt", remaining: "Verbleibend", overTarget: "Über dem Ziel", protein: "Protein", carbs: "Kohlenhydrate", fat: "Fett", planned: "Geplant", done: "Erledigt", skipped: "Übersprungen", alignment: "Plan-Ziel-Abgleich",
  groceryList: "Einkaufsliste", openList: "Liste öffnen", itemsChecked: "{count} Artikel · {checked} erledigt", breakfast: "Frühstück", lunch: "Mittagessen", dinner: "Abendessen", snacks: "Snacks", noMeals: "Keine Mahlzeiten geplant.",
  addBreakfast: "Frühstück hinzufügen", addLunch: "Mittagessen hinzufügen", addDinner: "Abendessen hinzufügen", addSnack: "Snack hinzufügen", toggleSection: "{meal} ein- oder ausklappen", quantityServing: "{quantity} × {serving}", markDone: "Erledigt", saving: "Speichern…", adjust: "Mahlzeitenaktionen", skip: "Überspringen", edit: "Bearbeiten", addGrocery: "Zur Einkaufsliste", remove: "Entfernen", removePlan: "Aus Plan entfernen", adjustChatGPT: "Mit ChatGPT anpassen",
  validationNeedsReview: "Nährwerte prüfen", completedCorrection: "Protokollierte Mahlzeit korrigieren", completedCorrectionDesc: "Essensplan und Verbrauchsverlauf werden gemeinsam aktualisiert.", addTitle: "Mahlzeit hinzufügen", addDescription: "Wähle, wie du eine Mahlzeit für {date} hinzufügen möchtest.", createChatGPT: "Mit ChatGPT erstellen/aktualisieren", addDirectly: "Direkt hinzufügen", openFoodHub: "Food Hub öffnen",
  directTitle: "Direkt hinzufügen", date: "Datum", foodName: "Lebensmittelname", mealType: "Mahlzeittyp", quantity: "Menge", serving: "Portion", nutritionDetails: "Nährwerte", calories: "Kalorien", notes: "Notizen", save: "Mahlzeit speichern", cancel: "Abbrechen", required: "Dieses Feld ist erforderlich.", positive: "Gib einen Wert größer als null ein.", nonNegative: "Gib null oder einen positiven Wert ein.",
  mealAdded: "Mahlzeit hinzugefügt", mealUpdated: "Mahlzeit aktualisiert", mealDone: "Mahlzeit erledigt", mealAlreadyDone: "Die Mahlzeit war bereits erledigt; kein doppelter Eintrag wurde erstellt.", mealSkipped: "Mahlzeit übersprungen", groceryAdded: "Zur Einkaufsliste hinzugefügt", groceryDuplicate: "Bereits in der Einkaufsliste", mealRemoved: "Mahlzeit entfernt", actionError: "Die Aktion konnte nicht abgeschlossen werden.", closeNotice: "Benachrichtigung schließen",
  deleteTitle: "Mahlzeit löschen?", deleteDesc: "Die geplante Mahlzeit wird entfernt.", removeLoggedTitle: "Erledigte Mahlzeit aus dem Plan entfernen?", removeLoggedDesc: "Der Planeintrag wird entfernt, verzehrte Kalorien bleiben in Ernährung und Verlauf erhalten.", previousWeek: "Vorherige Woche", nextWeek: "Nächste Woche", weekRange: "{start} – {end}", noWeekMeals: "Für diesen Tag sind keine Mahlzeiten geplant.", target: "Ziel", activeCalories: "Aktiv eingeplant", consumedCalories: "Verzehrt",
  chatAdjustTitle: "Mahlzeit mit ChatGPT anpassen", chatAdjustDesc: "Wähle eine gezielte Anpassung. ChatGPT erhält nur autorisierten Essensplan-Kontext.",
  replace: "Ersetzen", replaceDesc: "Ersetze diese Mahlzeit und behalte Datum und Nährwertkontext bei.", cheaper: "Günstiger", cheaperDesc: "Erstelle anhand der gespeicherten Präferenzen eine günstigere Alternative.", faster: "Schneller", fasterDesc: "Erstelle anhand der gespeicherten Kochvorgaben eine schnellere Alternative.", moreProtein: "Mehr Protein", moreProteinDesc: "Erhöhe den Proteingehalt und aktualisiere alle Nährwerte.", swapIngredient: "Zutat tauschen", swapIngredientDesc: "Ersetze eine Zutat unter Beachtung von Allergien und Präferenzen.", dairyFree: "Ohne Milchprodukte", dairyFreeDesc: "Erstelle eine milchfreie Version mit aktualisierten Nährwerten.", glutenFree: "Glutenfrei", glutenFreeDesc: "Erstelle eine glutenfreie Version mit aktualisierten Nährwerten.", changeCuisine: "Küche ändern", changeCuisineDesc: "Ändere die Küche und behalte den Zweck der Mahlzeit bei.",
  close: "Schließen", statusPlanned: "Geplant", statusDone: "Erledigt", statusSkipped: "Übersprungen", repairCompletion: "Abschluss reparieren", invalidRow: "Dieser gespeicherte Eintrag ist inkonsistent und muss korrigiert werden.", meals: "Mahlzeiten", upToDate: "Aktuell",
  defaultDay: "Standardtag", trainingDay: "Trainingstag", restDay: "Ruhetag", highActivityDay: "Tag mit hoher Aktivität", baseFallback: "Basis-Ersatzziel",
  unexpectedTitle: "Mein Essensplan konnte nicht geladen werden", unexpectedDesc: "Ein unerwarteter Seitenfehler ist aufgetreten. Lade die Seite erneut oder kehre zum Dashboard zurück.", dashboard: "Dashboard"
};

const ar: typeof en = {
  ...en,
  title: "خطة وجباتي", description: "خطّط مع ChatGPT ثم نفّذ وصحّح كل يوم داخل Plaivra.", updateChatGPT: "تحديث باستخدام ChatGPT", addMeal: "إضافة وجبة", moreActions: "إجراءات إضافية", foodPreferences: "تفضيلات الطعام",
  day: "اليوم", week: "الأسبوع", shopping: "التسوّق", previousDay: "اليوم السابق", nextDay: "اليوم التالي", today: "اليوم", loadingMeals: "جارٍ تحميل الوجبات…", loadMealsError: "تعذّر تحميل الوجبات.", retry: "إعادة المحاولة", targetUnavailable: "هدف التغذية غير متاح مؤقتًا.",
  effectiveTarget: "الهدف الفعّال", scheduled: "المجدول", consumed: "المستهلك", remaining: "المتبقي", overTarget: "فوق الهدف", protein: "البروتين", carbs: "الكربوهيدرات", fat: "الدهون", planned: "مخطط", done: "مكتمل", skipped: "متخطّى", alignment: "توافق الخطة مع الهدف",
  groceryList: "قائمة المشتريات", openList: "فتح القائمة", itemsChecked: "{count} عناصر · {checked} مكتملة", breakfast: "الإفطار", lunch: "الغداء", dinner: "العشاء", snacks: "الوجبات الخفيفة", noMeals: "لا توجد وجبات مخططة.",
  addBreakfast: "إضافة إفطار", addLunch: "إضافة غداء", addDinner: "إضافة عشاء", addSnack: "إضافة وجبة خفيفة", toggleSection: "فتح أو إغلاق قسم {meal}", quantityServing: "{quantity} × {serving}", markDone: "تم", saving: "جارٍ الحفظ…", adjust: "إجراءات الوجبة", skip: "تخطّي", edit: "تعديل", addGrocery: "إضافة للمشتريات", remove: "إزالة", removePlan: "إزالة من الخطة", adjustChatGPT: "تعديل باستخدام ChatGPT",
  validationNeedsReview: "راجع بيانات التغذية", completedCorrection: "تصحيح وجبة مسجلة", completedCorrectionDesc: "سيتم تحديث الخطة وسجل الاستهلاك معًا.", addTitle: "إضافة وجبة", addDescription: "اختر طريقة إضافة وجبة لتاريخ {date}.", createChatGPT: "إنشاء أو تحديث باستخدام ChatGPT", addDirectly: "إضافة مباشرة", openFoodHub: "فتح مركز الطعام",
  directTitle: "إضافة مباشرة", date: "التاريخ", foodName: "اسم الطعام", mealType: "نوع الوجبة", quantity: "الكمية", serving: "الحصة", nutritionDetails: "تفاصيل التغذية", calories: "السعرات", notes: "ملاحظات", save: "حفظ الوجبة", cancel: "إلغاء", required: "هذا الحقل مطلوب.", positive: "أدخل قيمة أكبر من صفر.", nonNegative: "أدخل صفرًا أو قيمة موجبة.",
  mealAdded: "تمت إضافة الوجبة", mealUpdated: "تم تحديث الوجبة", mealDone: "تم إكمال الوجبة", mealAlreadyDone: "كانت الوجبة مكتملة بالفعل ولم يتم إنشاء سجل مكرر.", mealSkipped: "تم تخطّي الوجبة", groceryAdded: "تمت الإضافة إلى قائمة المشتريات", groceryDuplicate: "موجودة بالفعل في قائمة المشتريات", mealRemoved: "تمت إزالة الوجبة", actionError: "تعذّر إكمال الإجراء.", closeNotice: "إغلاق الإشعار",
  deleteTitle: "حذف الوجبة؟", deleteDesc: "سيتم حذف الوجبة المخططة.", removeLoggedTitle: "إزالة الوجبة المكتملة من الخطة؟", removeLoggedDesc: "سيتم حذفها من الخطة، لكن السعرات المستهلكة ستظل محفوظة في سجل التغذية.", previousWeek: "الأسبوع السابق", nextWeek: "الأسبوع التالي", weekRange: "{start} – {end}", noWeekMeals: "لا توجد وجبات مخططة لهذا اليوم.", target: "الهدف", activeCalories: "السعرات المجدولة", consumedCalories: "السعرات المستهلكة",
  chatAdjustTitle: "تعديل الوجبة باستخدام ChatGPT", chatAdjustDesc: "اختر تعديلًا محددًا. سيصل إلى ChatGPT فقط سياق خطة الوجبات المصرح به.",
  replace: "استبدال", replaceDesc: "استبدل الوجبة مع الحفاظ على التاريخ وسياق التغذية.", cheaper: "أقل تكلفة", cheaperDesc: "أنشئ بديلًا أقل تكلفة باستخدام التفضيلات المحفوظة.", faster: "أسرع", fasterDesc: "أنشئ بديلًا أسرع باستخدام قيود الطهي المحفوظة.", moreProtein: "بروتين أكثر", moreProteinDesc: "زِد البروتين وحدّث جميع القيم الغذائية.", swapIngredient: "تبديل مكوّن", swapIngredientDesc: "استبدل مكوّنًا مع مراعاة الحساسيات والتفضيلات.", dairyFree: "بدون ألبان", dairyFreeDesc: "أنشئ نسخة بدون ألبان مع تحديث القيم الغذائية.", glutenFree: "بدون جلوتين", glutenFreeDesc: "أنشئ نسخة بدون جلوتين مع تحديث القيم الغذائية.", changeCuisine: "تغيير المطبخ", changeCuisineDesc: "غيّر نوع المطبخ مع الحفاظ على غرض الوجبة.",
  close: "إغلاق", statusPlanned: "مخطط", statusDone: "مكتمل", statusSkipped: "متخطّى", repairCompletion: "إصلاح الإكمال", invalidRow: "هذا السجل غير متّسق ويجب تصحيحه قبل استخدامه.", meals: "وجبات", upToDate: "محدّث",
  defaultDay: "اليوم الافتراضي", trainingDay: "يوم التدريب", restDay: "يوم الراحة", highActivityDay: "يوم نشاط مرتفع", baseFallback: "الهدف الأساسي البديل",
  unexpectedTitle: "تعذّر تحميل خطة وجباتي", unexpectedDesc: "حدث خطأ غير متوقع في الصفحة. أعد المحاولة أو ارجع إلى لوحة التحكم.", dashboard: "لوحة التحكم"
};

export type MealPlanCopy = typeof en;
export function getMealPlanCopy(language: SupportedLanguage): MealPlanCopy {
  return language === "de" ? de : language === "ar" ? ar : en;
}
export function interpolateCopy(value: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((result, [key, replacement]) => result.replaceAll(`{${key}}`, String(replacement)), value);
}
