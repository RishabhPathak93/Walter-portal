import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk, parseJson, requireAdmin } from "@/lib/http";
import { adminErrorResponse } from "@/lib/admin-route";
import { setFlagSchema } from "@/lib/validation";
import { setChallengeFlag } from "@/lib/services/admin";

/**
 * PUT /api/admin/challenges/:id/flag  { flag } — replace a challenge flag.
 * Only the HMAC digest is stored; the plaintext is never persisted or logged,
 * and is never returned by any endpoint.
 */
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/admin/challenges/[id]/flag">) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return jsonError(404, "not_found", "Challenge not found.");
  const body = await parseJson(request, setFlagSchema);
  if (body.response) return body.response;
  try {
    await setChallengeFlag(auth.user.id, id, body.data.flag);
    return jsonOk({ id }, { message: "Flag updated." });
  } catch (error) {
    return adminErrorResponse("admin/challenges:flag", error);
  }
}
