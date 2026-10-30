import { getCompetition, getPublicChallenges } from "@/lib/services/queries";
import { jsonOk, publicCache, serverError } from "@/lib/http";

/**
 * GET /api/challenges — public challenge metadata (never flags).
 * Personal solved status is available from GET /api/me/solves.
 */
export async function GET() {
  try {
    const [competition, challenges] = await Promise.all([getCompetition(), getPublicChallenges()]);
    return jsonOk(
      {
        state: competition.state,
        visible: competition.challengesVisible,
        challenges: challenges.map(({ id, slug, title, category, difficulty, solveCount, nextPoints }) => ({
          id,
          slug,
          title,
          category,
          difficulty,
          solveCount,
          nextPoints,
        })),
      },
      { cache: publicCache(10, 30) },
    );
  } catch (error) {
    return serverError("challenges", error);
  }
}
