import { getPublicChallenge } from "@/lib/services/queries";
import { jsonError, jsonOk, publicCache, serverError } from "@/lib/http";
import { slugSchema } from "@/lib/validation";

/** GET /api/challenges/:slug — public details of a visible, active challenge. */
export async function GET(_request: Request, ctx: RouteContext<"/api/challenges/[slug]">) {
  const { slug } = await ctx.params;
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) return jsonError(404, "challenge_not_found", "Challenge not found.");
  try {
    const challenge = await getPublicChallenge(parsed.data);
    if (!challenge) return jsonError(404, "challenge_not_found", "Challenge not found.");
    return jsonOk(challenge, { cache: publicCache(10, 30) });
  } catch (error) {
    return serverError("challenge", error);
  }
}
