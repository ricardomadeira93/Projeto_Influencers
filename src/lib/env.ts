import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1).optional(),
  INTERNAL_CRON_SECRET: z.string().min(1),
  TRANSCRIBE_PROVIDER: z.enum(["stub", "openai", "faster_whisper"]).default("stub"),
  TRANSCRIBE_LANGUAGE: z.string().min(2).max(12).default("pt"),
  FASTER_WHISPER_MODEL: z.string().min(1).default("small"),
  FASTER_WHISPER_COMPUTE_TYPE: z.string().min(1).default("int8"),
  SEGMENT_PROVIDER: z.enum(["ollama", "openai"]).default("ollama"),
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().min(1).default("qwen2.5:14b-instruct"),
  AI_OUTPUT_LANGUAGE: z.string().min(2).default("pt-BR"),
  CLIP_MIN_SECONDS: z.coerce.number().default(20),
  CLIP_TARGET_SECONDS: z.coerce.number().default(26),
  CLIP_MAX_SECONDS: z.coerce.number().default(30),
  CLIP_MAX_COUNT: z.coerce.number().default(3),
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
