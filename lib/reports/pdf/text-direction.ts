import bidiFactory from "@/lib/reports/pdf/vendor/bidi.cjs";

import type { ReportDirection } from "@/lib/reports/pdf/types";
import type { ReportFontFamily } from "@/lib/reports/pdf/fonts";

type BidiLevels = Readonly<{ levels: readonly number[] }>;
type BidiApi = Readonly<{
  getEmbeddingLevels: (text: string, direction: ReportDirection) => BidiLevels;
  getReorderedIndices: (text: string, levels: BidiLevels) => readonly number[];
  getMirroredCharactersMap: (
    text: string,
    levels: BidiLevels,
  ) => ReadonlyMap<number, string>;
}>;

const bidi = (bidiFactory as () => BidiApi)();
const ARABIC = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/u;

export type DirectionalTextRun = Readonly<{
  text: string;
  direction: ReportDirection;
  preferredFont: ReportFontFamily;
}>;

export function containsArabic(text: string) {
  return ARABIC.test(text);
}

function preferredFamily(character: string, direction: ReportDirection): ReportFontFamily {
  if (containsArabic(character)) return "arabic";
  if (/\s/u.test(character) && direction === "rtl") return "arabic";
  return "latin";
}

/**
 * Returns visual run order while preserving logical character order inside each
 * run. Fontkit receives logical Arabic runs and owns shaping; bidi-js owns run
 * ordering and mirrored punctuation. No whole-string reversal is performed.
 */
export function directionalTextRuns(
  text: string,
  baseDirection: ReportDirection,
): readonly DirectionalTextRun[] {
  if (!text) return Object.freeze([]);
  const levels = bidi.getEmbeddingLevels(text, baseDirection);
  const reordered = bidi.getReorderedIndices(text, levels);
  const mirrored = bidi.getMirroredCharactersMap(text, levels);
  const characters = text.split("");

  type LogicalGroup = {
    start: number;
    end: number;
    level: number;
    direction: ReportDirection;
    preferredFont: ReportFontFamily;
  };
  const groups: LogicalGroup[] = [];
  const groupByIndex = new Map<number, number>();
  for (let index = 0; index < characters.length; index += 1) {
    const level = levels.levels[index] ?? (baseDirection === "rtl" ? 1 : 0);
    const direction: ReportDirection = level % 2 === 1 ? "rtl" : "ltr";
    const preferredFont = preferredFamily(characters[index] ?? "", direction);
    const previous = groups.at(-1);
    if (
      previous &&
      previous.end + 1 === index &&
      previous.level === level &&
      previous.preferredFont === preferredFont
    ) {
      previous.end = index;
      groupByIndex.set(index, groups.length - 1);
    } else {
      groups.push({ start: index, end: index, level, direction, preferredFont });
      groupByIndex.set(index, groups.length - 1);
    }
  }

  const visualGroupOrder: number[] = [];
  const seen = new Set<number>();
  for (const index of reordered) {
    const groupId = groupByIndex.get(index);
    if (groupId !== undefined && !seen.has(groupId)) {
      seen.add(groupId);
      visualGroupOrder.push(groupId);
    }
  }
  for (let groupId = 0; groupId < groups.length; groupId += 1) {
    if (!seen.has(groupId)) visualGroupOrder.push(groupId);
  }

  return Object.freeze(
    visualGroupOrder.map((groupId) => {
      const group = groups[groupId]!;
      let value = "";
      for (let index = group.start; index <= group.end; index += 1) {
        value += mirrored.get(index) ?? characters[index] ?? "";
      }
      return Object.freeze({
        text: value,
        direction: group.direction,
        preferredFont: group.preferredFont,
      });
    }),
  );
}
