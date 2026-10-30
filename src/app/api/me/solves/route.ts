import { getMySolves } from "@/lib/services/queries";
import { jsonOk, requireUser, serverError } from "@/lib/http";

/** GET /api/me/solves — own accepted solves (RLS-restricted). Private. */
export async function GET() {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  try {
    return jsonOk({ solves: await getMySolves() });
  } catch (error) {
    return serverError("me/solves", error);
  }
}
