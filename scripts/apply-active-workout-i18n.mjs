import fs from "node:fs";

const translations = {
  en: {
    ActiveWorkout: {
      navigator: {
        title: "Workout exercises",
        description: "Choose an exercise to continue your workout.",
        pausedDescription: "Review the workout. Resume before changing exercises.",
        readOnlyDescription: "You can review the workout here. Continue on the controlling device to change exercises.",
        replacedFrom: "Replaced {name}"
      },
      replacement: {
        whyReplace: "Why are you replacing it?",
        reasonMachineTaken: "Machine taken",
        reasonEquipmentUnavailable: "Equipment unavailable",
        reasonPainDiscomfort: "Pain / discomfort",
        reasonTooHard: "Too hard today",
        reasonOther: "Other",
        painCaution: "Choose an option that feels appropriate for you. Plaivra does not label an exercise as medically safe for pain.",
        bestMatches: "Best matches",
        loading: "Finding eligible replacements",
        unavailable: "Recommendations could not be loaded. Your current exercise was kept.",
        noMatches: "No strong eligible matches were found for this reason.",
        replace: "Replace",
        browseAll: "Browse all exercises",
        samePrimaryMuscles: "Same primary muscles",
        similarMovement: "Similar movement",
        differentEquipment: "Different equipment",
        easierVariation: "Easier variation",
        usedBefore: "Used before",
        strongIdentity: "Fully tracked"
      },
      set: {
        savedResyncing: "Set saved. Workout position is resyncing.",
        saveFailedValuesKept: "Couldn’t save this set. Your values were kept."
      },
      validation: {
        repsRequired: "Enter reps.",
        weightRequired: "Enter weight. Use 0 for bodyweight or no added load."
      },
      exercise: {
        nextTarget: "Next target",
        detailsUnavailable: "Exercise details aren’t available for this exercise yet."
      },
      rest: { next: "Next" }
    },
    settings: {
      workoutFeedback: "Workout feedback",
      workoutFeedbackDescription: "Control optional sound and supported-device haptics during workout execution.",
      workoutSounds: "Workout sounds",
      workoutSoundsDescription: "Play short, restrained feedback sounds when sets and workouts complete.",
      haptics: "Haptics",
      hapticsDescription: "Use subtle haptic feedback on supported devices. Unsupported browsers do nothing."
    }
  },
  de: {
    ActiveWorkout: {
      navigator: {
        title: "Übungen im Workout",
        description: "Wähle eine Übung, um dein Workout fortzusetzen.",
        pausedDescription: "Du kannst das Workout ansehen. Setze es fort, bevor du die Übung wechselst.",
        readOnlyDescription: "Du kannst das Workout hier ansehen. Wechsle Übungen auf dem steuernden Gerät.",
        replacedFrom: "Ersetzt {name}"
      },
      replacement: {
        whyReplace: "Warum ersetzt du die Übung?",
        reasonMachineTaken: "Gerät belegt",
        reasonEquipmentUnavailable: "Equipment nicht verfügbar",
        reasonPainDiscomfort: "Schmerz / Beschwerden",
        reasonTooHard: "Heute zu schwer",
        reasonOther: "Anderer Grund",
        painCaution: "Wähle eine Option, die sich für dich passend anfühlt. Plaivra bezeichnet keine Übung als medizinisch sicher bei Schmerzen.",
        bestMatches: "Beste Alternativen",
        loading: "Geeignete Alternativen werden gesucht",
        unavailable: "Empfehlungen konnten nicht geladen werden. Die aktuelle Übung wurde beibehalten.",
        noMatches: "Für diesen Grund wurden keine starken geeigneten Alternativen gefunden.",
        replace: "Ersetzen",
        browseAll: "Alle Übungen durchsuchen",
        samePrimaryMuscles: "Gleiche Hauptmuskeln",
        similarMovement: "Ähnliche Bewegung",
        differentEquipment: "Anderes Equipment",
        easierVariation: "Leichtere Variante",
        usedBefore: "Schon verwendet",
        strongIdentity: "Vollständig trackbar"
      },
      set: {
        savedResyncing: "Satz gespeichert. Die Workout-Position wird neu synchronisiert.",
        saveFailedValuesKept: "Der Satz konnte nicht gespeichert werden. Deine Werte wurden beibehalten."
      },
      validation: {
        repsRequired: "Wiederholungen eingeben.",
        weightRequired: "Gewicht eingeben. Verwende 0 für Körpergewicht oder ohne Zusatzgewicht."
      },
      exercise: {
        nextTarget: "Nächstes Ziel",
        detailsUnavailable: "Für diese Übung sind noch keine Übungsdetails verfügbar."
      },
      rest: { next: "Als Nächstes" }
    },
    settings: {
      workoutFeedback: "Workout-Feedback",
      workoutFeedbackDescription: "Steuere optionale Sounds und Haptik auf unterstützten Geräten während des Workouts.",
      workoutSounds: "Workout-Sounds",
      workoutSoundsDescription: "Spiele kurze, dezente Sounds ab, wenn Sätze und Workouts abgeschlossen werden.",
      haptics: "Haptik",
      hapticsDescription: "Nutze dezentes haptisches Feedback auf unterstützten Geräten. Nicht unterstützte Browser tun nichts."
    }
  },
  ar: {
    ActiveWorkout: {
      navigator: {
        title: "تمارين الجلسة",
        description: "اختر تمرينًا للمتابعة داخل نفس الجلسة.",
        pausedDescription: "يمكنك مراجعة التمارين. استأنف الجلسة قبل تغيير التمرين.",
        readOnlyDescription: "يمكنك مراجعة الجلسة هنا. غيّر التمرين من الجهاز المتحكم في الجلسة.",
        replacedFrom: "بديل عن {name}"
      },
      replacement: {
        whyReplace: "لماذا تريد استبدال التمرين؟",
        reasonMachineTaken: "الجهاز مشغول",
        reasonEquipmentUnavailable: "المعدات غير متاحة",
        reasonPainDiscomfort: "ألم / عدم ارتياح",
        reasonTooHard: "صعب اليوم",
        reasonOther: "سبب آخر",
        painCaution: "اختر بديلًا تشعر أنه مناسب لك. لا يصف Plaivra أي تمرين بأنه آمن طبيًا للألم.",
        bestMatches: "أفضل البدائل",
        loading: "جارٍ البحث عن بدائل مؤهلة",
        unavailable: "تعذر تحميل التوصيات. تم الإبقاء على التمرين الحالي.",
        noMatches: "لم يتم العثور على بدائل مؤهلة قوية لهذا السبب.",
        replace: "استبدال",
        browseAll: "تصفح كل التمارين",
        samePrimaryMuscles: "نفس العضلات الأساسية",
        similarMovement: "حركة مشابهة",
        differentEquipment: "معدات مختلفة",
        easierVariation: "نسخة أسهل",
        usedBefore: "استُخدم من قبل",
        strongIdentity: "قابل للتتبع بالكامل"
      },
      set: {
        savedResyncing: "تم حفظ المجموعة. جارٍ إعادة مزامنة موضع التمرين.",
        saveFailedValuesKept: "تعذر حفظ المجموعة. تم الاحتفاظ بالقيم التي أدخلتها."
      },
      validation: {
        repsRequired: "أدخل عدد التكرارات.",
        weightRequired: "أدخل الوزن. استخدم 0 لوزن الجسم أو بدون وزن إضافي."
      },
      exercise: {
        nextTarget: "الهدف التالي",
        detailsUnavailable: "تفاصيل هذا التمرين غير متاحة بعد."
      },
      rest: { next: "التالي" }
    },
    settings: {
      workoutFeedback: "ملاحظات التمرين",
      workoutFeedbackDescription: "تحكم في أصوات التمرين والاهتزاز على الأجهزة المدعومة.",
      workoutSounds: "أصوات التمرين",
      workoutSoundsDescription: "تشغيل أصوات قصيرة وهادئة عند إكمال المجموعات والتمرين.",
      haptics: "الاهتزاز",
      hapticsDescription: "استخدم اهتزازًا خفيفًا على الأجهزة المدعومة. المتصفحات غير المدعومة لن تفعل شيئًا."
    }
  }
};

function merge(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const current = target[key];
      target[key] = current && typeof current === "object" && !Array.isArray(current) ? current : {};
      merge(target[key], value);
    } else {
      target[key] = value;
    }
  }
}

for (const locale of ["en", "de", "ar"]) {
  const path = `messages/${locale}.json`;
  const messages = JSON.parse(fs.readFileSync(path, "utf8"));
  merge(messages, translations[locale]);
  fs.writeFileSync(path, `${JSON.stringify(messages, null, 2)}\n`);
}

const preferencesPath = "app/(private)/settings/preferences/page.tsx";
let preferences = fs.readFileSync(preferencesPath, "utf8");
preferences = preferences
  .replace('<CardTitle className="text-base">Workout feedback</CardTitle>', '<CardTitle className="text-base">{t("settings.workoutFeedback")}</CardTitle>')
  .replace('<CardDescription>Control optional sound and supported-device haptics during workout execution.</CardDescription>', '<CardDescription>{t("settings.workoutFeedbackDescription")}</CardDescription>')
  .replace('label="Workout sounds"', 'label={t("settings.workoutSounds")}')
  .replace('description="Play short, restrained feedback sounds when sets and workouts complete."', 'description={t("settings.workoutSoundsDescription")}')
  .replace('updatePreference("workoutSounds", checked, "Workout sounds")', 'updatePreference("workoutSounds", checked, t("settings.workoutSounds"))')
  .replace('label="Haptics"', 'label={t("settings.haptics")}')
  .replace('description="Request subtle haptic feedback on supported devices. Unsupported browsers safely do nothing."', 'description={t("settings.hapticsDescription")}')
  .replace('updatePreference("haptics", checked, "Haptics")', 'updatePreference("haptics", checked, t("settings.haptics"))');
fs.writeFileSync(preferencesPath, preferences);

console.log("Active Workout EN/DE/AR localization patches applied.");
