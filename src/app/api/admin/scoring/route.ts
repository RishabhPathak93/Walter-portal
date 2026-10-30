import type { NextRequest } from "next/server";
import { jsonOk, parseJson, requireAdmin } from "@/lib/http";
import { adminErrorResponse } from "@/lib/admin-route";
import { scoringSchema } from "@/lib/validation";
import { getScoringAdmin, updateScoring } from "@/lib/services/admin";

/** GET /api/admin/scoring — admin only. */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  try {
    return jsonOk(await getScoringAdmin());
  } catch (error) {
    return adminErrorResponse("admin/scoring:get", error);
  }
}

/**
 * PATCH /api/admin/scoring
 * { rules: [{position, points}], defaultPoints, recalculate, confirmRecalculate? }
 * New values apply to future solves only. recalculate=true (with
 * confirmRecalculate:"RECALCULATE") rewrites points of existing solves.
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const body = await parseJson(request, scoringSchema);
  if (body.response) return body.response;
  try {
    const result = await updateScoring(auth.user.id, body.data);
    return jsonOk(result, {
      message: body.data.recalculate
        ? `Scoring updated and ${result.solvesChanged} existing solve(s) recalculated.`
        : "Scoring updated. New values apply to future solves.",
    });
  } catch (error) {
    return adminErrorResponse("admin/scoring:update", error);
  }
}
