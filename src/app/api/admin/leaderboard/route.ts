import type { NextRequest } from "next/server";
import { jsonOk, PRIVATE_NO_STORE, requireAdmin } from "@/lib/http";
import { adminErrorResponse } from "@/lib/admin-route";
import { adminLeaderboard, leaderboardToCsv } from "@/lib/services/admin";

/**
 * GET /api/admin/leaderboard            — JSON rankings (admin only)
 * GET /api/admin/leaderboard?format=csv — CSV export of public columns
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  try {
    const rows = await adminLeaderboard(auth.user.id);
    if (request.nextUrl.searchParams.get("format") === "csv") {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      return new Response(leaderboardToCsv(rows), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="leaderboard-${stamp}.csv"`,
          "Cache-Control": PRIVATE_NO_STORE,
        },
      });
    }
    return jsonOk({ entries: rows });
  } catch (error) {
    return adminErrorResponse("admin/leaderboard", error);
  }
}
