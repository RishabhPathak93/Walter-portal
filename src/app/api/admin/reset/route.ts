import type { NextRequest } from "next/server";
import { jsonOk, parseJson, requireAdmin } from "@/lib/http";
import { adminErrorResponse } from "@/lib/admin-route";
import { resetSchema } from "@/lib/validation";
import { resetCompetition } from "@/lib/services/admin";

/**
 * POST /api/admin/reset  { confirmation: "RESET" }
 * Deletes ALL solves, submissions and score adjustments (participants,
 * challenges, flags and settings are kept). Audited. Admin only.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const body = await parseJson(request, resetSchema);
  if (body.response) return body.response;
  try {
    const result = await resetCompetition(auth.user.id);
    return jsonOk(result, { message: "Competition reset. All scores and submission history were deleted." });
  } catch (error) {
    return adminErrorResponse("admin/reset", error);
  }
}
