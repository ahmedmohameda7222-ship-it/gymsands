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
      : "Admin access is required for Food Catalog curation.";
  } catch {
    return "Admin access is required for Food Catalog curation.";
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

  // Service-role access is created only after requireAdmin has revalidated the
  // current bearer session. The client-side admin layout is not mutation authority.
  const supabase = createSupabaseServerClient(null, true);
  const actor: FoodCatalogActor = { role: "admin" };

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
        description="Bounded owner curation for canonical Plaivra Food identity and provenance."
      />
      <FoodCatalogAdmin execute={executeFoodCatalogCommand} />
    </>
  );
}
