import type { NextRequest } from "next/server";
import { jsonOk, parseJson, requireAdmin } from "@/lib/http";
import { adminErrorResponse } from "@/lib/admin-route";
import { scoreAdjustmentSchema } from "@/lib/validation";
import { adjustScore } from "@/lib/services/admin";

/** POST /api/admin/score-adjustments  { userId, points, reason } — audited correction. Admin only. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const body = await parseJson(request, scoreAdjustmentSchema);
  if (body.response) return body.response;
  try {
    const created = await adjustScore(auth.user.id, body.data.userId, body.data.points, body.data.reason);
    return jsonOk(created, { status: 201, message: "Score adjustment recorded." });
  } catch (error) {
    return adminErrorResponse("admin/score-adjustments", error);
  }
}
