import type { NextRequest } from "next/server";
import { jsonOk, parseJson, requireAdmin } from "@/lib/http";
import { adminErrorResponse } from "@/lib/admin-route";
import { competitionSettingsSchema } from "@/lib/validation";
import { getCompetitionAdmin, updateCompetition } from "@/lib/services/admin";

/** GET /api/admin/competition — admin only. */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  try {
    return jsonOk(await getCompetitionAdmin());
  } catch (error) {
    return adminErrorResponse("admin/competition:get", error);
  }
}

/** PATCH /api/admin/competition — full settings object (see README). Admin only. */
export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const body = await parseJson(request, competitionSettingsSchema);
  if (body.response) return body.response;
  try {
    await updateCompetition(auth.user.id, body.data);
    return jsonOk(null, { message: "Competition settings saved." });
  } catch (error) {
    return adminErrorResponse("admin/competition:update", error);
  }
}
