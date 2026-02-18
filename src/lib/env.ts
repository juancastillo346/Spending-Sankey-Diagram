import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PLAID_ENV: z.enum(["sandbox", "development", "production"]).default("sandbox"),
  PLAID_CLIENT_ID: z.string().min(1, "PLAID_CLIENT_ID is required"),
  PLAID_SECRET: z.string().min(1, "PLAID_SECRET is required"),
});

export type Env = z.infer<typeof EnvSchema>;

export function getEnv(): Env {
  // Next.js only exposes NEXT_PUBLIC_* to the browser; this stays server-only.
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const formatted = parsed.error.flatten().fieldErrors;
    throw new Error(
      `Invalid environment variables. Check .env.\n${JSON.stringify(
        formatted,
        null,
        2,
      )}`,
    );
  }
  return parsed.data;
}

