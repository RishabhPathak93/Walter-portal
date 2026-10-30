import type { NextRequest } from "next/server";
import { getLeaderboard } from "@/lib/services/queries";
import { jsonOk, publicCache, serverError } from "@/lib/http";
import { z } from "zod";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(200),
});

/**
 * GET /api/leaderboard?page=1&pageSize=100
 * Public. Short CDN cache so many polling clients share one database query.
 */
export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    pageSize: request.nextUrl.searchParams.get("pageSize") ?? undefined,
  });
  const page = parsed.success ? parsed.data.page : 1;
  const pageSize = parsed.success ? parsed.data.pageSize : 200;
  try {
    const entries = await getLeaderboard(pageSize, (page - 1) * pageSize);
    return jsonOk({ entries, generatedAt: new Date().toISOString(), page, pageSize }, { cache: publicCache(2, 3) });
  } catch (error) {
    return serverError("leaderboard", error);
  }
}
