import type { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin } from "@/lib/http";
import { adminErrorResponse } from "@/lib/admin-route";
import { paginationSchema } from "@/lib/validation";
import { listAuditLogs } from "@/lib/services/admin";

/** GET /api/admin/audit?page=&pageSize= — admin only. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const parsed = paginationSchema.safeParse({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    pageSize: request.nextUrl.searchParams.get("pageSize") ?? undefined,
  });
  if (!parsed.success) return jsonError(400, "validation_error", "Invalid pagination parameters.");
  try {
    return jsonOk(await listAuditLogs(parsed.data.page, parsed.data.pageSize));
  } catch (error) {
    return adminErrorResponse("admin/audit", error);
  }
}
