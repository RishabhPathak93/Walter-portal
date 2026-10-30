import { getViewer } from "@/lib/auth";
import { getMyStanding } from "@/lib/services/queries";
import { jsonOk, requireUser, serverError } from "@/lib/http";

/** GET /api/me — the signed-in participant's profile and standing. Private. */
export async function GET() {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  try {
    const [viewer, standing] = await Promise.all([getViewer(), getMyStanding()]);
    return jsonOk({
      id: auth.user.id,
      email: auth.user.email,
      username: viewer?.username ?? null,
      isDisabled: viewer?.isDisabled ?? false,
      isAdmin: viewer?.isAdmin ?? false,
      standing,
    });
  } catch (error) {
    return serverError("me", error);
  }
}
