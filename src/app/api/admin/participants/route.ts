import { jsonOk, requireAdmin } from "@/lib/http";
import { adminErrorResponse } from "@/lib/admin-route";
import { listParticipants } from "@/lib/services/admin";

/** GET /api/admin/participants — usernames, scores, attempt stats. Admin only. */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  try {
    return jsonOk({ participants: await listParticipants(auth.user.id) });
  } catch (error) {
    return adminErrorResponse("admin/participants", error);
  }
}
