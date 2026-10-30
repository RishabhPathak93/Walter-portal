import { NextResponse, type NextRequest } from "next/server";
import { flagSubmissionSchema, slugSchema } from "@/lib/validation";
import { getClientIp, jsonError, parseJson, PRIVATE_NO_STORE, requireUser, serverError } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { rpcFromSupabase } from "@/lib/services/rpc";
import { submitFlag } from "@/lib/services/submissions";

/**
 * POST /api/challenges/:slug/submit   body: { "flag": "flag{...}" }
 * Auth: signed-in participant (identity from the verified session only).
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/challenges/[slug]/submit">) {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  const { slug: rawSlug } = await ctx.params;
  const slug = slugSchema.safeParse(rawSlug);
  if (!slug.success) return jsonError(404, "challenge_not_found", "Challenge not found.");

  const body = await parseJson(request, flagSubmissionSchema);
  if (body.response) return body.response;

  try {
    const outcome = await submitFlag(rpcFromSupabase(getSupabaseAdmin()), {
      userId: auth.user.id,
      slug: slug.data,
      flag: body.data.flag,
      ip: getClientIp(request),
    });
    return NextResponse.json(outcome.body, {
      status: outcome.httpStatus,
      headers: { "Cache-Control": PRIVATE_NO_STORE, ...outcome.headers },
    });
  } catch (error) {
    return serverError("submit", error);
  }
}
