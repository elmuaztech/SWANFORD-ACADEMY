import { z } from "zod";

/**
 * Environment Variable Schema & Validation
 * Master Specification Reference: Sections 8, 9, 14
 * 
 * Enforces strict validation across Local, Staging, and Production environments.
 * Prevents application startup with invalid or unconfigured infrastructure secrets.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  APP_URL: z
    .string()
    .url("APP_URL must be a valid URL")
    .default("http://localhost:3000"),

  // PostgreSQL Database URLs (Pooled and Direct)
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required for PostgreSQL connection"),

  DIRECT_URL: z
    .string()
    .optional(),

  // Session & Cryptography
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters for security"),

  // Payment Gateway (Paystack)
  PAYSTACK_SECRET_KEY: z
    .string()
    .min(1, "PAYSTACK_SECRET_KEY is required"),

  PAYSTACK_PUBLIC_KEY: z
    .string()
    .min(1, "PAYSTACK_PUBLIC_KEY is required"),

  PAYSTACK_WEBHOOK_SECRET: z
    .string()
    .optional(),

  // Notification Provider Abstraction
  NOTIFICATION_PROVIDER: z
    .enum(["mock", "smtp", "termii"])
    .default("mock"),

  // Optional SMTP Configuration
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().transform(Number).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates environment variables against the schema.
 * Returns parsed environment or throws descriptive error.
 */
export function validateEnv(customEnv?: Record<string, string | undefined>): Env {
  const targetEnv = customEnv || process.env;
  const result = envSchema.safeParse(targetEnv);

  if (!result.success) {
    const errorDetails = result.error.format();
    const formatted = Object.entries(errorDetails)
      .filter(([key]) => key !== "_errors")
      .map(([key, val]) => ` - ${key}: ${(val as { _errors: string[] })._errors?.join(", ")}`)
      .join("\n");

    const message = `[Configuration Error] Invalid environment variables:\n${formatted}`;
    
    // In test environment, throw error for test assertions
    if (targetEnv.NODE_ENV === "test") {
      throw new Error(message);
    }
    
    console.error(message);
    throw new Error(message);
  }

  return result.data;
}

// Lazy singleton getter for safe access in runtime code
let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = validateEnv();
  }
  return cachedEnv;
}
