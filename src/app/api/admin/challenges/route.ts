import type { NextRequest } from "next/server";
import { jsonOk, parseJson, requireAdmin } from "@/lib/http";
import { adminErrorResponse } from "@/lib/admin-route";
import { createChallengeSchema } from "@/lib/validation";
import { createChallenge, listChallenges } from "@/lib/services/admin";

/** GET /api/admin/challenges — all challenges incl. inactive (never flags). Admin only. */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  try {
    return jsonOk({ challenges: await listChallenges(auth.user.id) });
  } catch (error) {
    return adminErrorResponse("admin/challenges:list", error);
  }
}

/** POST /api/admin/challenges — create a challenge with its flag. Admin only. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const body = await parseJson(request, createChallengeSchema);
  if (body.response) return body.response;
  try {
    const created = await createChallenge(auth.user.id, body.data);
    return jsonOk(created, { status: 201, message: "Challenge created." });
  } catch (error) {
    return adminErrorResponse("admin/challenges:create", error);
  }
}
