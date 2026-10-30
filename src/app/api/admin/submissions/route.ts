import type { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin } from "@/lib/http";
import { adminErrorResponse } from "@/lib/admin-route";
import { adminSubmissionsQuerySchema } from "@/lib/validation";
import { listSubmissions } from "@/lib/services/admin";

/**
 * GET /api/admin/submissions?view=attempts|solves&userId=&challengeId=&outcome=&page=&pageSize=
 * Admin only.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const sp = request.nextUrl.searchParams;
  const parsed = adminSubmissionsQuerySchema.safeParse({
    view: sp.get("view") ?? undefined,
    userId: sp.get("userId") || undefined,
    challengeId: sp.get("challengeId") || undefined,
    outcome: sp.get("outcome") || undefined,
    page: sp.get("page") ?? undefined,
    pageSize: sp.get("pageSize") ?? undefined,
  });
  if (!parsed.success) return jsonError(400, "validation_error", "Invalid filters.");
  try {
    return jsonOk(await listSubmissions(parsed.data));
  } catch (error) {
    return adminErrorResponse("admin/submissions", error);
  }
}
