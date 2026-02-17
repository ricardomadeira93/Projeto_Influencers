import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  INTERNAL_CRON_SECRET: z.string().min(1),
  FREE_MINUTES_TOTAL: z.coerce.number().default(60),
  MAX_UPLOAD_DURATION: z.coerce.number().default(1800)
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const messages = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment configuration: ${messages}`);
}

export const env = parsed.data;
