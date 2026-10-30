import "server-only";
import { AdminDbError } from "@/lib/services/admin";
import { mapDbError, serverError } from "@/lib/http";

export function adminErrorResponse(context: string, error: unknown) {
  if (error instanceof AdminDbError) {
    const mapped = mapDbError(error.db);
    if (mapped) return mapped;
  }
  return serverError(context, error);
}
