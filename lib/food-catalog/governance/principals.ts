export const FOOD_GOVERNANCE_ROLE_CLASSES = ["owner", "curator", "service"] as const;
export type FoodGovernanceRoleClass = (typeof FOOD_GOVERNANCE_ROLE_CLASSES)[number];

export const FOOD_GOVERNANCE_CAPABILITIES = [
  "food.governance.manage_principals",
  "food.correction.report",
  "food.correction.review",
  "food.correction.approve",
  "food.correction.apply",
  "food.evidence.attach",
  "food.nutrition.correct",
  "food.serving.correct",
  "food.name.correct",
  "food.barcode.correct",
  "food.taxonomy.correct",
  "food.market.correct",
  "food.identity.merge",
  "food.lifecycle.withdraw",
  "food.lifecycle.restore",
  "food.break_glass",
  "food.personal_override.write",
  "food.observability.read",
  "food.ingestion.propose",
  "food.outbox.deliver",
] as const;
export type FoodGovernanceCapability = (typeof FOOD_GOVERNANCE_CAPABILITIES)[number];

export type FoodGovernancePrincipal = {
  id: string;
  principalType: "human" | "service";
  subjectId: string;
  roleClass: FoodGovernanceRoleClass;
  capabilities: readonly FoodGovernanceCapability[];
};

export type FoodGovernanceCapabilityAssignment = {
  capability: FoodGovernanceCapability;
  revokedAt: string | null;
};

const OWNER_CAPABILITIES: readonly FoodGovernanceCapability[] = FOOD_GOVERNANCE_CAPABILITIES.filter(
  (capability) => capability !== "food.ingestion.propose" && capability !== "food.outbox.deliver",
);
const CURATOR_CAPABILITIES: readonly FoodGovernanceCapability[] = [
  "food.correction.report",
  "food.correction.review",
  "food.correction.approve",
  "food.correction.apply",
  "food.evidence.attach",
  "food.nutrition.correct",
  "food.serving.correct",
  "food.name.correct",
  "food.barcode.correct",
  "food.taxonomy.correct",
  "food.market.correct",
  "food.identity.merge",
  "food.lifecycle.withdraw",
  "food.lifecycle.restore",
  "food.observability.read",
];
const SERVICE_CAPABILITIES: readonly FoodGovernanceCapability[] = [
  "food.correction.report",
  "food.evidence.attach",
  "food.ingestion.propose",
];

export const DEFAULT_FOOD_GOVERNANCE_CAPABILITIES: Readonly<
  Record<FoodGovernanceRoleClass, readonly FoodGovernanceCapability[]>
> = Object.freeze({
  owner: Object.freeze(OWNER_CAPABILITIES),
  curator: Object.freeze(CURATOR_CAPABILITIES),
  service: Object.freeze(SERVICE_CAPABILITIES),
});

function requireNonblank(value: string, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

export function validateFoodGovernancePrincipal(
  principal: FoodGovernancePrincipal,
): FoodGovernancePrincipal {
  requireNonblank(principal.id, "Food governance principal ID");
  requireNonblank(principal.subjectId, "Food governance principal subject");
  if (!FOOD_GOVERNANCE_ROLE_CLASSES.includes(principal.roleClass)) {
    throw new Error("Food governance role class is invalid.");
  }
  if (principal.principalType === "service" && principal.roleClass !== "service") {
    throw new Error("Service principal cannot escalate to a human governance role.");
  }
  if (principal.principalType === "human" && principal.roleClass === "service") {
    throw new Error("Human principal cannot use the Service principal role class.");
  }
  const seen = new Set<FoodGovernanceCapability>();
  for (const capability of principal.capabilities) {
    if (!FOOD_GOVERNANCE_CAPABILITIES.includes(capability)) {
      throw new Error(`Food governance capability is invalid: ${capability}`);
    }
    if (seen.has(capability)) throw new Error(`Duplicate Food governance capability: ${capability}`);
    seen.add(capability);
  }
  return principal;
}

export function assertFoodGovernanceCapability(
  principal: FoodGovernancePrincipal,
  capability: FoodGovernanceCapability,
) {
  validateFoodGovernancePrincipal(principal);
  if (!principal.capabilities.includes(capability)) {
    throw new Error(`Food governance capability denied: ${capability}`);
  }
}

export function capabilitySnapshot(
  assignments: readonly FoodGovernanceCapabilityAssignment[],
): readonly FoodGovernanceCapability[] {
  return Object.freeze(
    assignments
      .filter((assignment) => assignment.revokedAt === null)
      .map((assignment) => assignment.capability)
      .filter((capability, index, all) => all.indexOf(capability) === index)
      .sort(),
  );
}
