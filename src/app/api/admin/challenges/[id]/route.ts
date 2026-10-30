import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk, parseJson, requireAdmin } from "@/lib/http";
import { adminErrorResponse } from "@/lib/admin-route";
import { updateChallengeSchema } from "@/lib/validation";
import { updateChallenge } from "@/lib/services/admin";

/** PATCH /api/admin/challenges/:id — edit metadata / activate / deactivate. Admin only. */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/admin/challenges/[id]">) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return jsonError(404, "not_found", "Challenge not found.");
  const body = await parseJson(request, updateChallengeSchema);
  if (body.response) return body.response;
  try {
    await updateChallenge(auth.user.id, id, body.data);
    return jsonOk({ id }, { message: "Challenge updated." });
  } catch (error) {
    return adminErrorResponse("admin/challenges:update", error);
  }
}
