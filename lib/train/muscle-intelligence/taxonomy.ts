export const MUSCLE_VIEWS = ["front", "back", "both"] as const;

export type MuscleView = (typeof MUSCLE_VIEWS)[number];
export type MuscleBodyRegion = "upper_body" | "core" | "lower_body";
export type MuscleNavigationGroup =
  | "chest"
  | "shoulders"
  | "back"
  | "arms"
  | "core"
  | "glutes"
  | "thighs"
  | "lower_legs";

export const CANONICAL_MUSCLES = [
  { id: "pectoralis_major", displayOrder: 1, labels: { en: "Chest", ar: "الصدر", de: "Brust" }, bodyRegion: "upper_body", supportedViews: ["front"], logicalNavigationGroup: "chest" },
  { id: "anterior_deltoid", displayOrder: 2, labels: { en: "Front Shoulders", ar: "الأكتاف الأمامية", de: "Vordere Schultern" }, bodyRegion: "upper_body", supportedViews: ["front"], logicalNavigationGroup: "shoulders" },
  { id: "lateral_deltoid", displayOrder: 3, labels: { en: "Side Shoulders", ar: "الأكتاف الجانبية", de: "Seitliche Schultern" }, bodyRegion: "upper_body", supportedViews: ["both"], logicalNavigationGroup: "shoulders" },
  { id: "posterior_deltoid", displayOrder: 4, labels: { en: "Rear Shoulders", ar: "الأكتاف الخلفية", de: "Hintere Schultern" }, bodyRegion: "upper_body", supportedViews: ["back"], logicalNavigationGroup: "shoulders" },
  { id: "trapezius", displayOrder: 5, labels: { en: "Neck & Traps", ar: "الرقبة والترابيس", de: "Nacken & Trapez" }, bodyRegion: "upper_body", supportedViews: ["both"], logicalNavigationGroup: "back" },
  { id: "latissimus_dorsi", displayOrder: 6, labels: { en: "Side Back", ar: "عضلات الظهر الجانبية", de: "Seitlicher Rücken" }, bodyRegion: "upper_body", supportedViews: ["back"], logicalNavigationGroup: "back" },
  { id: "upper_back", displayOrder: 7, labels: { en: "Upper Back", ar: "أعلى الظهر", de: "Oberer Rücken" }, bodyRegion: "upper_body", supportedViews: ["back"], logicalNavigationGroup: "back" },
  { id: "biceps_brachii", displayOrder: 8, labels: { en: "Biceps", ar: "البايسبس", de: "Bizeps" }, bodyRegion: "upper_body", supportedViews: ["front"], logicalNavigationGroup: "arms" },
  { id: "triceps_brachii", displayOrder: 9, labels: { en: "Triceps", ar: "الترايسبس", de: "Trizeps" }, bodyRegion: "upper_body", supportedViews: ["back"], logicalNavigationGroup: "arms" },
  { id: "forearms", displayOrder: 10, labels: { en: "Forearms", ar: "السواعد", de: "Unterarme" }, bodyRegion: "upper_body", supportedViews: ["both"], logicalNavigationGroup: "arms" },
  { id: "rotator_cuff", displayOrder: 11, labels: { en: "Shoulder Stabilizers", ar: "مثبتات الكتف", de: "Schulterstabilisatoren" }, bodyRegion: "upper_body", supportedViews: ["both"], logicalNavigationGroup: "shoulders" },
  { id: "serratus_anterior", displayOrder: 12, labels: { en: "Side Rib Muscles", ar: "العضلات الجانبية للأضلاع", de: "Seitliche Rippenmuskeln" }, bodyRegion: "upper_body", supportedViews: ["front"], logicalNavigationGroup: "chest" },
  { id: "rectus_abdominis", displayOrder: 13, labels: { en: "Abs", ar: "عضلات البطن", de: "Bauchmuskeln" }, bodyRegion: "core", supportedViews: ["front"], logicalNavigationGroup: "core" },
  { id: "obliques", displayOrder: 14, labels: { en: "Side Abs", ar: "عضلات البطن الجانبية", de: "Seitliche Bauchmuskeln" }, bodyRegion: "core", supportedViews: ["both"], logicalNavigationGroup: "core" },
  { id: "erector_spinae", displayOrder: 15, labels: { en: "Lower Back", ar: "أسفل الظهر", de: "Unterer Rücken" }, bodyRegion: "core", supportedViews: ["back"], logicalNavigationGroup: "back" },
  { id: "gluteus_maximus", displayOrder: 16, labels: { en: "Glutes", ar: "عضلات المؤخرة", de: "Gesäß" }, bodyRegion: "lower_body", supportedViews: ["back"], logicalNavigationGroup: "glutes" },
  { id: "gluteus_medius", displayOrder: 17, labels: { en: "Side Glutes", ar: "عضلات المؤخرة الجانبية", de: "Seitliches Gesäß" }, bodyRegion: "lower_body", supportedViews: ["both"], logicalNavigationGroup: "glutes" },
  { id: "quadriceps", displayOrder: 18, labels: { en: "Front Thighs", ar: "عضلات الفخذ الأمامية", de: "Vordere Oberschenkel" }, bodyRegion: "lower_body", supportedViews: ["front"], logicalNavigationGroup: "thighs" },
  { id: "hamstrings", displayOrder: 19, labels: { en: "Back Thighs", ar: "عضلات الفخذ الخلفية", de: "Hintere Oberschenkel" }, bodyRegion: "lower_body", supportedViews: ["back"], logicalNavigationGroup: "thighs" },
  { id: "adductors", displayOrder: 20, labels: { en: "Inner Thighs", ar: "عضلات الفخذ الداخلية", de: "Innere Oberschenkel" }, bodyRegion: "lower_body", supportedViews: ["front"], logicalNavigationGroup: "thighs" },
  { id: "hip_flexors", displayOrder: 21, labels: { en: "Hip Flexors", ar: "مثنيات الورك", de: "Hüftbeuger" }, bodyRegion: "lower_body", supportedViews: ["front"], logicalNavigationGroup: "thighs" },
  { id: "gastrocnemius", displayOrder: 22, labels: { en: "Upper Calves", ar: "عضلات السمانة العلوية", de: "Oberer Wadenmuskel" }, bodyRegion: "lower_body", supportedViews: ["back"], logicalNavigationGroup: "lower_legs" },
  { id: "soleus", displayOrder: 23, labels: { en: "Deep Calves", ar: "عضلات السمانة العميقة", de: "Tiefer Wadenmuskel" }, bodyRegion: "lower_body", supportedViews: ["back"], logicalNavigationGroup: "lower_legs" },
  { id: "tibialis_anterior", displayOrder: 24, labels: { en: "Shins", ar: "عضلات الساق الأمامية", de: "Schienbeinmuskeln" }, bodyRegion: "lower_body", supportedViews: ["front"], logicalNavigationGroup: "lower_legs" }
] as const satisfies readonly {
  id: string;
  displayOrder: number;
  labels: { en: string; ar: string; de: string };
  bodyRegion: MuscleBodyRegion;
  supportedViews: readonly MuscleView[];
  logicalNavigationGroup: MuscleNavigationGroup;
}[];

export type CanonicalMuscleDefinition = (typeof CANONICAL_MUSCLES)[number];
export type CanonicalMuscleId = CanonicalMuscleDefinition["id"];

export const CANONICAL_MUSCLE_IDS = CANONICAL_MUSCLES.map((muscle) => muscle.id) as readonly CanonicalMuscleId[];

const canonicalMuscleIds = new Set<string>(CANONICAL_MUSCLE_IDS);
const canonicalMusclesById = new Map<CanonicalMuscleId, CanonicalMuscleDefinition>(
  CANONICAL_MUSCLES.map((muscle) => [muscle.id, muscle])
);

export function isCanonicalMuscleId(value: unknown): value is CanonicalMuscleId {
  return typeof value === "string" && canonicalMuscleIds.has(value);
}

export function getCanonicalMuscle(id: CanonicalMuscleId): CanonicalMuscleDefinition;
export function getCanonicalMuscle(id: string): CanonicalMuscleDefinition | undefined;
export function getCanonicalMuscle(id: string): CanonicalMuscleDefinition | undefined {
  return isCanonicalMuscleId(id) ? canonicalMusclesById.get(id) : undefined;
}
