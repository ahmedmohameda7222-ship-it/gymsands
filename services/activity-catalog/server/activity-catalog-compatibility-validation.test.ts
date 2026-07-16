import { describe, expect, it } from "vitest";
import { parseActivitySearch } from "@/app/api/activity-catalog/_shared";

function request(query: string) {
  return new Request(`https://plaivra.test/api/activity-catalog/activities?${query}`);
}

describe("Activity Catalog compatibility-filter validation", () => {
  it("parses bounded, canonical, comma-separated filter lists", () => {
    expect(parseActivitySearch(request([
      "activityTypes=strength%2Ccardio",
      "difficulties=beginner%2Cadvanced",
      "primaryMuscles=chest%2Cshoulders",
      "secondaryMuscles=triceps",
      "muscleCategories=upper_body",
      "movementPatterns=horizontal_push",
      "forceTypes=push",
      "equipment=barbell%2Cdumbbell",
      "limit=60",
      "offset=120"
    ].join("&")))).toMatchObject({
      activityTypes: ["strength", "cardio"],
      difficulties: ["beginner", "advanced"],
      primaryMuscles: ["chest", "shoulders"],
      secondaryMuscles: ["triceps"],
      muscleCategories: ["upper_body"],
      movementPatterns: ["horizontal_push"],
      forceTypes: ["push"],
      equipment: ["barbell", "dumbbell"],
      limit: 60,
      offset: 120
    });
  });

  it.each([
    "primaryMuscles=chest%2Cchest",
    `primaryMuscles=${Array.from({ length: 21 }, (_, index) => `muscle_${index}`).join("%2C")}`,
    "primaryMuscles=Chest",
    "primaryMuscles=chest&primaryMuscles=back",
    "movementPatterns=horizontal_push%2C",
    "forceTypes=push%2Cpull%20unsafe"
  ])("rejects unbounded, duplicate, or non-canonical list input: %s", (query) => {
    expect(() => parseActivitySearch(request(query))).toThrow();
  });
});
