import { FoodCatalogAdmin } from "@/components/nutrition/food-library/admin/food-catalog-admin";
import { PageHeading } from "@/components/layout/page-heading";
import { createSupabaseServerClient, requireAdmin } from "@/lib/integrations/env";
import {
  deprecateFood,
  listFoodCatalogCandidates,
  mergeFood,
  normalizeFood,
  publishFood,
  restoreFood,
  unverifyFood,
  verifyFood,
  type FoodCatalogActor,
  type FoodCatalogCommand,
  type FoodCatalogSnapshot,
} from "@/services/nutrition-v1/server/food-curation";

async function adminError(response: Response) {
  try {
    const body = await response.clone().json() as { error?: unknown };
    return typeof body.error === "string" && body.error.trim()
      ? body.error.trim()
      : "Admin access is required for Food Catalog governance.";
  } catch {
    return "Admin access is required for Food Catalog governance.";
  }
}

export async function executeFoodCatalogCommand(
  accessToken: string,
  command: FoodCatalogCommand,
): Promise<FoodCatalogSnapshot> {
  "use server";

  const token = accessToken.trim();
  if (!token) throw new Error("Admin session expired.");
  const request = new Request("http://plaivra.local/admin/food-catalog", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const authorization = await requireAdmin(request);
  if (authorization instanceof Response) throw new Error(await adminError(authorization));

  // This gate now authorizes only access to the retired console. It is not Food
  // canonical mutation authority; Plan 6 named governance commands own writes.
  const supabase = createSupabaseServerClient(null, true);
  const actor: FoodCatalogActor = { authorized: true };

  if (command.kind === "normalize") await normalizeFood(supabase, actor, command.input);
  if (command.kind === "publish") await publishFood(supabase, actor, command.foodId);
  if (command.kind === "verify") await verifyFood(supabase, actor, { foodId: command.foodId, sourceRecordId: command.sourceRecordId });
  if (command.kind === "unverify") await unverifyFood(supabase, actor, command.foodId);
  if (command.kind === "merge") await mergeFood(supabase, actor, { sourceFoodId: command.sourceFoodId, targetFoodId: command.targetFoodId });
  if (command.kind === "deprecate") await deprecateFood(supabase, actor, command.foodId);
  if (command.kind === "restore") await restoreFood(supabase, actor, command.foodId);

  return listFoodCatalogCandidates(supabase, actor, { limit: 40 });
}

export default function FoodCatalogAdminPage() {
  return (
    <>
      <PageHeading
        title="Food Catalog"
        description="Legacy row curation is retired; canonical changes require Plan 6 governed correction commands."
      />
      <FoodCatalogAdmin execute={executeFoodCatalogCommand} />
    </>
  );
}
