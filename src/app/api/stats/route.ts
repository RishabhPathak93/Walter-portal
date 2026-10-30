import { getCompetition, getPublicStats, getScoringRules } from "@/lib/services/queries";
import { jsonOk, publicCache, serverError } from "@/lib/http";

/** GET /api/stats — public competition summary for the landing page. */
export async function GET() {
  try {
    const [competition, stats, scoring] = await Promise.all([getCompetition(), getPublicStats(), getScoringRules()]);
    return jsonOk({ competition, stats, scoring }, { cache: publicCache(5, 30) });
  } catch (error) {
    return serverError("stats", error);
  }
}
