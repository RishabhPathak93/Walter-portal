import { jsonOk, requireAdmin } from "@/lib/http";
import { adminErrorResponse } from "@/lib/admin-route";
import { getAdminOverview } from "@/lib/services/admin";

/** GET /api/admin/overview — admin only. */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  try {
    return jsonOk(await getAdminOverview());
  } catch (error) {
    return adminErrorResponse("admin/overview", error);
  }
}
