import type { NextRequest } from "next/server";
import { getMySubmissions } from "@/lib/services/queries";
import { jsonError, jsonOk, requireUser, serverError } from "@/lib/http";
import { paginationSchema } from "@/lib/validation";

/** GET /api/me/submissions?page=1&pageSize=25 — own attempt history. Private. */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const parsed = paginationSchema.safeParse({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    pageSize: request.nextUrl.searchParams.get("pageSize") ?? undefined,
  });
  if (!parsed.success) return jsonError(400, "validation_error", "Invalid pagination parameters.");
  try {
    return jsonOk(await getMySubmissions(parsed.data.page, parsed.data.pageSize));
  } catch (error) {
    return serverError("me/submissions", error);
  }
}
