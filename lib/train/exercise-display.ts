import type { SupportedLanguage } from "@/lib/i18n/types";

export type ExerciseDisplayDomain =
  | "muscle"
  | "equipment"
  | "difficulty"
  | "mechanics"
  | "movement"
  | "force"
  | "category";

type LocalizedLabel = Record<SupportedLanguage, string>;
type DomainDictionary = Record<string, LocalizedLabel>;

function label(en: string, de: string, ar: string): LocalizedLabel {
  return { en, de, ar };
}

const muscleLabels: DomainDictionary = {
  adductors: label("Inner Thigh", "Adduktoren", "عضلات الفخذ الداخلية"),
  anterior_deltoid: label("Front Shoulders", "Vordere Schulter", "الكتف الأمامي"),
  biceps_brachii: label("Biceps", "Bizeps", "البايسبس"),
  erector_spinae: label("Lower Back", "Unterer Rücken", "أسفل الظهر"),
  forearms: label("Forearms", "Unterarme", "الساعد"),
  gastrocnemius: label("Upper Calves", "Waden", "عضلات السمانة العلوية"),
  gluteus_maximus: label("Glutes", "Gesäß", "عضلات المؤخرة"),
  gluteus_medius: label("Side Glutes", "Seitliches Gesäß", "عضلات المؤخرة الجانبية"),
  hamstrings: label("Hamstrings", "Beinbeuger", "عضلات الفخذ الخلفية"),
  hip_flexors: label("Hip Flexors", "Hüftbeuger", "مثنيات الورك"),
  lateral_deltoid: label("Side Shoulders", "Seitliche Schulter", "الكتف الجانبي"),
  latissimus_dorsi: label("Lats", "Latissimus", "عضلات الظهر الجانبية"),
  obliques: label("Obliques", "Seitliche Bauchmuskeln", "عضلات البطن الجانبية"),
  pectoralis_major: label("Chest", "Brust", "الصدر"),
  posterior_deltoid: label("Rear Shoulders", "Hintere Schulter", "الكتف الخلفي"),
  quadriceps: label("Quadriceps", "Quadrizeps", "عضلات الفخذ الأمامية"),
  rectus_abdominis: label("Abs", "Gerade Bauchmuskeln", "عضلات البطن"),
  rotator_cuff: label("Rotator Cuff", "Rotatorenmanschette", "الكفة المدورة"),
  serratus_anterior: label("Serratus", "Sägemuskel", "العضلة المنشارية"),
  soleus: label("Lower Calves", "Tiefer Wadenmuskel", "عضلة السمانة العميقة"),
  tibialis_anterior: label("Front Shins", "Vorderer Schienbeinmuskel", "عضلات قصبة الساق الأمامية"),
  trapezius: label("Traps", "Trapezmuskel", "الترابيس"),
  triceps_brachii: label("Triceps", "Trizeps", "الترايسبس"),
  upper_back: label("Upper Back", "Oberer Rücken", "أعلى الظهر"),
  chest: label("Chest", "Brust", "الصدر"),
  shoulders: label("Shoulders", "Schultern", "الكتفين"),
  arms: label("Arms", "Arme", "الذراعين"),
  back: label("Back", "Rücken", "الظهر"),
  core: label("Core", "Rumpf", "عضلات الجذع"),
  hips: label("Hips", "Hüfte", "الورك"),
  legs: label("Legs", "Beine", "الرجلين"),
  calves: label("Calves", "Waden", "السمانة"),
  full_body: label("Full Body", "Ganzkörper", "الجسم بالكامل"),
  upper_body: label("Upper Body", "Oberkörper", "الجزء العلوي من الجسم"),
  lower_body: label("Lower Body", "Unterkörper", "الجزء السفلي من الجسم")
};

const equipmentLabels: DomainDictionary = {
  ankle_strap: label("Ankle Strap", "Fußmanschette", "حزام الكاحل"),
  back_extension_bench: label("Back Extension Bench", "Rückenstreckerbank", "مقعد تمديد الظهر"),
  barbell: label("Barbell", "Langhantel", "بار حديد"),
  bench: label("Bench", "Bank", "مقعد"),
  bodyweight: label("Bodyweight", "Körpergewicht", "وزن الجسم"),
  cable_machine: label("Cable Machine", "Kabelzug", "جهاز الكابل"),
  cable_row_machine: label("Seated Row Machine", "Ruderzugmaschine", "جهاز التجديف"),
  calf_raise_machine: label("Calf Raise Machine", "Wadenhebemaschine", "جهاز السمانة"),
  dumbbell: label("Dumbbell", "Kurzhantel", "دمبل"),
  dumbbells: label("Dumbbells", "Kurzhanteln", "دمبل"),
  ez_bar: label("EZ Bar", "SZ-Stange", "بار EZ"),
  hip_abduction_machine: label("Hip Abduction Machine", "Abduktorenmaschine", "جهاز فتح الفخذ"),
  hip_adduction_machine: label("Hip Adduction Machine", "Adduktorenmaschine", "جهاز ضم الفخذ"),
  incline_bench: label("Incline Bench", "Schrägbank", "مقعد مائل"),
  lat_pulldown_machine: label("Lat Pulldown Machine", "Latzug", "جهاز السحب العلوي"),
  leg_extension_machine: label("Leg Extension Machine", "Beinstrecker", "جهاز مد الرجل"),
  leg_press_machine: label("Leg Press", "Beinpresse", "جهاز ضغط الرجل"),
  lying_leg_curl_machine: label("Lying Leg Curl", "Liegender Beinbeuger", "جهاز خلفية الرجل مستلقي"),
  parallel_bars: label("Parallel Bars", "Parallelbarren", "متوازي"),
  pec_deck_machine: label("Pec Deck", "Butterfly-Maschine", "جهاز الفراشة"),
  preacher_bench: label("Preacher Bench", "Scottbank", "مقعد البايسبس"),
  pull_up_bar: label("Pull-up Bar", "Klimmzugstange", "عقلة"),
  reverse_pec_deck_machine: label("Reverse Pec Deck", "Reverse-Butterfly", "جهاز الفراشة الخلفي"),
  rope_attachment: label("Rope Attachment", "Seilgriff", "حبل كابل"),
  seated_calf_raise_machine: label("Seated Calf Raise", "Sitzendes Wadenheben", "جهاز سمانة جالس"),
  seated_leg_curl_machine: label("Seated Leg Curl", "Sitzender Beinbeuger", "جهاز خلفية الرجل جالس"),
  squat_rack: label("Squat Rack", "Kniebeugenständer", "حامل السكوات"),
  step_box: label("Step Box", "Step-Box", "صندوق تمارين"),
  machine: label("Machine", "Maschine", "جهاز"),
  none: label("No Equipment", "Keine Geräte", "بدون معدات")
};

const difficultyLabels: DomainDictionary = {
  beginner: label("Beginner", "Anfänger", "مبتدئ"),
  intermediate: label("Intermediate", "Fortgeschritten", "متوسط"),
  advanced: label("Advanced", "Sehr fortgeschritten", "متقدم")
};

const mechanicsLabels: DomainDictionary = {
  carry: label("Carry", "Tragen", "حمل"),
  compound: label("Compound", "Mehrgelenkig", "تمرين مركب"),
  isolation: label("Isolation", "Isolationsübung", "تمرين عزل"),
  isometric: label("Isometric", "Isometrisch", "تمرين ثابت")
};

const forceLabels: DomainDictionary = {
  carry: label("Carry", "Tragen", "حمل"),
  isometric: label("Static Hold", "Isometrisches Halten", "ثبات"),
  mixed: label("Push and Pull", "Drücken und Ziehen", "دفع وسحب"),
  pull: label("Pull", "Ziehen", "سحب"),
  push: label("Push", "Drücken", "دفع")
};

const movementLabels: DomainDictionary = {
  anti_extension: label("Anti-Extension", "Anti-Extension", "مقاومة تقوس الظهر"),
  anti_lateral_flexion: label("Anti-Side Bend", "Anti-Seitneigung", "مقاومة الميل الجانبي"),
  anti_rotation: label("Anti-Rotation", "Anti-Rotation", "مقاومة الدوران"),
  dorsiflexion: label("Ankle Raise", "Fußheben", "رفع مقدمة القدم"),
  elbow_extension: label("Triceps Extension", "Armstrecken", "مد الكوع"),
  elbow_extension_overhead: label("Overhead Triceps Extension", "Trizepsstrecken über Kopf", "مد الترايسبس فوق الرأس"),
  elbow_flexion: label("Biceps Curl", "Armbeugen", "ثني الكوع"),
  elbow_flexion_neutral_grip: label("Hammer Curl", "Hammer-Curl", "هامر كيرل"),
  hip_abduction: label("Hip Abduction", "Hüftabduktion", "فتح الفخذ"),
  hip_adduction: label("Hip Adduction", "Hüftadduktion", "ضم الفخذ"),
  hip_extension: label("Hip Extension", "Hüftstreckung", "مد الورك"),
  hip_flexion: label("Hip Flexion", "Hüftbeugung", "ثني الورك"),
  hip_flexion_trunk_control: label("Hip Flexion with Core Control", "Hüftbeugung mit Rumpfkontrolle", "ثني الورك مع ثبات الجذع"),
  hip_hinge: label("Hip Hinge", "Hüftbeuge", "انحناء الورك"),
  horizontal_abduction: label("Horizontal Pull-Apart", "Horizontale Abduktion", "فتح الذراع أفقيًا"),
  horizontal_adduction: label("Chest Fly", "Horizontale Adduktion", "ضم الذراع أفقيًا"),
  horizontal_pull: label("Horizontal Pull", "Horizontales Ziehen", "سحب أفقي"),
  horizontal_pull_external_rotation: label("High Row with External Rotation", "Horizontales Ziehen mit Außenrotation", "سحب أفقي مع دوران خارجي"),
  horizontal_push: label("Horizontal Push", "Horizontales Drücken", "دفع أفقي"),
  inclined_horizontal_push: label("Incline Push", "Schräges Drücken", "دفع مائل"),
  knee_extension: label("Knee Extension", "Kniestreckung", "مد الركبة"),
  knee_flexion: label("Knee Flexion", "Kniebeugung", "ثني الركبة"),
  loaded_carry: label("Loaded Carry", "Tragen mit Last", "حمل أوزان"),
  lunge: label("Lunge", "Ausfallschritt", "اندفاع"),
  plantar_flexion_extended_knee: label("Standing Calf Raise", "Wadenheben stehend", "سمانة واقف"),
  plantar_flexion_flexed_knee: label("Seated Calf Raise", "Wadenheben sitzend", "سمانة جالس"),
  scapular_elevation: label("Shoulder Shrug", "Schulterheben", "رفع الكتفين"),
  scapular_protraction: label("Shoulder-Blade Protraction", "Schulterblatt-Protraktion", "دفع لوح الكتف للأمام"),
  shoulder_abduction: label("Side Raise", "Seitliches Armheben", "رفع جانبي"),
  shoulder_extension: label("Straight-Arm Pull", "Schulterstreckung", "سحب الذراع للخلف"),
  shoulder_external_rotation: label("External Shoulder Rotation", "Schulter-Außenrotation", "دوران الكتف للخارج"),
  squat: label("Squat", "Kniebeuge", "سكوات"),
  squat_machine: label("Machine Squat", "Maschinen-Kniebeuge", "سكوات جهاز"),
  step: label("Step-Up", "Aufsteigen", "صعود صندوق"),
  trunk_flexion: label("Trunk Flexion", "Rumpfbeugung", "ثني الجذع"),
  trunk_flexion_posterior_pelvic_tilt: label("Reverse Crunch", "Reverse Crunch", "كرنش عكسي"),
  trunk_rotation: label("Trunk Rotation", "Rumpfdrehung", "دوران الجذع"),
  unilateral_squat: label("Single-Leg Squat", "Einbeinige Kniebeuge", "سكوات رجل واحدة"),
  vertical_pull: label("Vertical Pull", "Vertikales Ziehen", "سحب رأسي"),
  vertical_push: label("Vertical Push", "Vertikales Drücken", "دفع رأسي")
};

const categoryLabels: DomainDictionary = {
  resistance: label("Strength Training", "Krafttraining", "تمارين مقاومة"),
  strength: label("Strength Training", "Krafttraining", "تمارين مقاومة"),
  bodyweight: label("Bodyweight", "Körpergewicht", "وزن الجسم"),
  mobility: label("Mobility", "Mobilität", "مرونة وحركة"),
  cardio: label("Cardio", "Ausdauer", "كارديو"),
  push: forceLabels.push,
  pull: forceLabels.pull,
  carry: forceLabels.carry,
  isometric: forceLabels.isometric
};

const dictionaries: Record<ExerciseDisplayDomain, DomainDictionary> = {
  muscle: muscleLabels,
  equipment: equipmentLabels,
  difficulty: difficultyLabels,
  mechanics: mechanicsLabels,
  movement: movementLabels,
  force: forceLabels,
  category: categoryLabels
};

export const CURATED_EXERCISE_DISPLAY_VOCABULARY = {
  muscles: [
    "adductors", "anterior_deltoid", "biceps_brachii", "erector_spinae", "forearms",
    "gastrocnemius", "gluteus_maximus", "gluteus_medius", "hamstrings", "hip_flexors",
    "lateral_deltoid", "latissimus_dorsi", "obliques", "pectoralis_major", "posterior_deltoid",
    "quadriceps", "rectus_abdominis", "rotator_cuff", "serratus_anterior", "soleus",
    "tibialis_anterior", "trapezius", "triceps_brachii", "upper_back"
  ],
  equipment: [
    "ankle_strap", "back_extension_bench", "barbell", "bench", "bodyweight", "cable_machine",
    "cable_row_machine", "calf_raise_machine", "dumbbell", "dumbbells", "ez_bar",
    "hip_abduction_machine", "hip_adduction_machine", "incline_bench", "lat_pulldown_machine",
    "leg_extension_machine", "leg_press_machine", "lying_leg_curl_machine", "parallel_bars",
    "pec_deck_machine", "preacher_bench", "pull_up_bar", "reverse_pec_deck_machine",
    "rope_attachment", "seated_calf_raise_machine", "seated_leg_curl_machine", "squat_rack", "step_box"
  ],
  difficulty: ["beginner", "intermediate", "advanced"],
  mechanics: ["carry", "compound", "isolation", "isometric"],
  force: ["carry", "isometric", "mixed", "pull", "push"],
  movement: Object.keys(movementLabels)
} as const;

function normalizeKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function humanizeTechnicalValue(value: string) {
  const clean = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_.-]+/g, " ")
    .replace(/\s+/g, " ");
  if (!clean) return "";
  if (!/[_.-]/.test(value)) return clean;
  return clean
    .split(" ")
    .map((part) => {
      if (/^(ez|rm|rpe|rir)$/i.test(part)) return part.toUpperCase();
      return `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`;
    })
    .join(" ");
}

export function resolveExerciseDisplayLanguage(locale?: string | null): SupportedLanguage {
  const normalized = locale?.trim().toLowerCase() ?? "";
  if (normalized.startsWith("de")) return "de";
  if (normalized.startsWith("ar")) return "ar";
  return "en";
}

export function formatExerciseDisplayValue(
  value: string | null | undefined,
  language: SupportedLanguage = "en",
  domain: ExerciseDisplayDomain = "category"
) {
  const clean = value?.trim() ?? "";
  if (!clean) return "";
  const resolved = dictionaries[domain][normalizeKey(clean)];
  return resolved?.[language] ?? humanizeTechnicalValue(clean);
}

export function formatExerciseDisplayList(
  value: string | string[] | null | undefined,
  language: SupportedLanguage = "en",
  domain: ExerciseDisplayDomain = "category"
) {
  const values = Array.isArray(value) ? value : (value ?? "").split(",");
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)))
    .map((item) => formatExerciseDisplayValue(item, language, domain))
    .filter(Boolean)
    .join(", ");
}

export function formatExerciseMetadataLine(
  values: Array<{ value: string | string[] | null | undefined; domain: ExerciseDisplayDomain }>,
  language: SupportedLanguage = "en"
) {
  return values
    .map(({ value, domain }) => formatExerciseDisplayList(value, language, domain))
    .filter(Boolean)
    .join(" · ");
}

export function isTechnicalExerciseDisplayValue(value: string | null | undefined) {
  const clean = value?.trim() ?? "";
  return Boolean(clean && (/[_.]/.test(clean) || /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(clean)));
}
