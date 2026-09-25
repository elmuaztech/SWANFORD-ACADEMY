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

  // Optional SMTP Configuration & Standard Aliases
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z
    .preprocess((val) => (val !== undefined && val !== "" ? Number(val) : undefined), z.number().optional()),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SMTP_FROM_EMAIL: z.string().optional(),
  SMTP_FROM_NAME: z.string().optional(),
  SMTP_SECURE: z.string().optional(),
  SMTP_CONNECTION_TIMEOUT: z
    .preprocess((val) => (val !== undefined && val !== "" ? Number(val) : undefined), z.number().optional()),
  SMTP_RETRY_LIMIT: z
    .preprocess((val) => (val !== undefined && val !== "" ? Number(val) : undefined), z.number().optional()),
}).superRefine((data, ctx) => {
  if (data.NOTIFICATION_PROVIDER === "smtp") {
    if (!data.SMTP_HOST || data.SMTP_HOST.trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SMTP_HOST"],
        message: "SMTP_HOST is required when NOTIFICATION_PROVIDER=smtp",
      });
    }
    const hasPass = Boolean(
      (data.SMTP_PASS && data.SMTP_PASS.trim() !== "") ||
      (data.SMTP_PASSWORD && data.SMTP_PASSWORD.trim() !== "")
    );
    const isPlaceholderUser =
      !data.SMTP_USER ||
      data.SMTP_USER.trim() === "" ||
      data.SMTP_USER === "YOUR_GMAIL_ADDRESS" ||
      data.SMTP_USER.includes("placeholder");
    if (!isPlaceholderUser && !hasPass) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SMTP_PASSWORD"],
        message: "SMTP_PASSWORD is required when SMTP_USER is set",
      });
    }
  }
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
