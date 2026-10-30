import { z } from "zod";

/** Shared validation schemas (used by API routes and client forms). */

export const USERNAME_REGEX = /^[A-Za-z0-9][A-Za-z0-9_-]{2,23}$/;
export const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const DIFFICULTIES = ["Easy", "Medium", "Hard", "Expert"] as const;

export const usernameSchema = z
  .string()
  .trim()
  .regex(USERNAME_REGEX, "Username must be 3–24 characters: letters, numbers, _ or -, starting with a letter or number.");

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")).pipe(z.string().max(254));

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(72, "Password must be at most 72 characters.");

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  username: usernameSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(72),
});

export const slugSchema = z.string().trim().max(64).regex(SLUG_REGEX, "Slug must be lowercase letters, numbers and single hyphens.");

export const flagSubmissionSchema = z.object({
  flag: z
    .string()
    .max(1024, "Flag is too long.")
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "Enter a flag.").max(256, "Flag is too long.")),
});

const isoDateTime = z.iso.datetime({ offset: true });

export const competitionSettingsSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    tagline: z.string().trim().max(160),
    description: z.string().trim().max(4000),
    startAt: isoDateTime.nullable(),
    endAt: isoDateTime.nullable(),
    isPaused: z.boolean(),
    registrationOpen: z.boolean(),
    hideChallengesBeforeStart: z.boolean(),
    rateLimitMaxAttempts: z.number().int().min(1).max(1000),
    rateLimitWindowSeconds: z.number().int().min(5).max(3600),
    ipRateLimitMaxAttempts: z.number().int().min(1).max(10000),
  })
  .strict()
  .refine((v) => !v.startAt || !v.endAt || new Date(v.endAt) > new Date(v.startAt), {
    message: "End time must be after start time.",
    path: ["endAt"],
  });

const challengeFields = {
  slug: slugSchema,
  title: z.string().trim().min(1).max(120),
  description: z.string().max(10000),
  category: z.string().trim().min(1).max(40),
  difficulty: z.enum(DIFFICULTIES),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(-10000).max(10000),
};

export const createChallengeSchema = z
  .object({
    ...challengeFields,
    flag: z.string().transform((s) => s.trim()).pipe(z.string().min(1, "A flag is required.").max(256)),
  })
  .strict();

export const updateChallengeSchema = z
  .object(challengeFields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

export const setFlagSchema = z
  .object({ flag: z.string().transform((s) => s.trim()).pipe(z.string().min(1).max(256)) })
  .strict();

export const scoringSchema = z
  .object({
    rules: z
      .array(z.object({ position: z.number().int().min(1).max(100), points: z.number().int().min(0).max(10000) }).strict())
      .max(100)
      .refine((rules) => new Set(rules.map((r) => r.position)).size === rules.length, "Each position may appear only once."),
    defaultPoints: z.number().int().min(0).max(10000),
    recalculate: z.boolean(),
    confirmRecalculate: z.literal("RECALCULATE").optional(),
  })
  .strict()
  .refine((v) => !v.recalculate || v.confirmRecalculate === "RECALCULATE", {
    message: "Historical recalculation requires typing RECALCULATE to confirm.",
    path: ["confirmRecalculate"],
  });

export const participantUpdateSchema = z
  .object({ disabled: z.boolean(), reason: z.string().trim().max(500).optional() })
  .strict();

export const scoreAdjustmentSchema = z
  .object({
    userId: z.uuid(),
    points: z.number().int().min(-100000).max(100000).refine((n) => n !== 0, "Points cannot be zero."),
    reason: z.string().trim().min(3, "Give a reason (min 3 characters).").max(500),
  })
  .strict();

export const resetSchema = z.object({ confirmation: z.literal("RESET") }).strict();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const adminSubmissionsQuerySchema = paginationSchema.extend({
  view: z.enum(["attempts", "solves"]).default("attempts"),
  userId: z.uuid().optional(),
  challengeId: z.uuid().optional(),
  outcome: z.enum(["correct", "incorrect", "already_solved"]).optional(),
});

/** Formats the first zod issue into a user-facing message. */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue?.message ?? "Invalid request.";
}
