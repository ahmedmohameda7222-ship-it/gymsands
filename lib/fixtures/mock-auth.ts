export const MOCK_AUTH_USER_ID = "00000000-0000-4000-8000-000000000001";

export function isMockAuthUserId(
  userId: string | null | undefined,
  nodeEnvironment = process.env.NODE_ENV,
  productionQaBuild = process.env.NEXT_PUBLIC_PLAIVRA_PRODUCTION_QA === "true",
) {
  return (
    (nodeEnvironment !== "production" || productionQaBuild) &&
    userId === MOCK_AUTH_USER_ID
  );
}
