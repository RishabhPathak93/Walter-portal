import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk, parseJson, requireAdmin } from "@/lib/http";
import { adminErrorResponse } from "@/lib/admin-route";
import { participantUpdateSchema } from "@/lib/validation";
import { setParticipantDisabled } from "@/lib/services/admin";

/** PATCH /api/admin/participants/:id  { disabled, reason? } — admin only, audited. */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/admin/participants/[id]">) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return jsonError(404, "not_found", "Participant not found.");
  const body = await parseJson(request, participantUpdateSchema);
  if (body.response) return body.response;
  try {
    await setParticipantDisabled(auth.user.id, id, body.data.disabled, body.data.reason);
    return jsonOk({ id }, { message: body.data.disabled ? "Participant disabled." : "Participant re-enabled." });
  } catch (error) {
    return adminErrorResponse("admin/participants:update", error);
  }
}
