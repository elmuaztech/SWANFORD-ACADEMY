import { describe, it, expect } from "vitest";
import { validateEnv } from "@/lib/env";

describe("Environment Validation Schema", () => {
  const validEnvConfig = {
    NODE_ENV: "test",
    APP_URL: "http://localhost:3000",
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/swanford_test?schema=public",
    SESSION_SECRET: "32_characters_minimum_super_secret_session_token_here",
    PAYSTACK_SECRET_KEY: "sk_test_1234567890abcdef",
    PAYSTACK_PUBLIC_KEY: "pk_test_1234567890abcdef",
    NOTIFICATION_PROVIDER: "mock",
  };

  it("validates a properly configured environment", () => {
    const parsed = validateEnv(validEnvConfig);
    expect(parsed.NODE_ENV).toBe("test");
    expect(parsed.DATABASE_URL).toContain("swanford_test");
    expect(parsed.NOTIFICATION_PROVIDER).toBe("mock");
  });

  it("rejects invalid APP_URL", () => {
    expect(() =>
      validateEnv({
        ...validEnvConfig,
        APP_URL: "not-a-valid-url",
      })
    ).toThrow("[Configuration Error]");
  });

  it("rejects SESSION_SECRET shorter than 32 characters", () => {
    expect(() =>
      validateEnv({
        ...validEnvConfig,
        SESSION_SECRET: "too-short",
      })
    ).toThrow("[Configuration Error]");
  });

  it("rejects missing DATABASE_URL", () => {
    const invalidConfig = { ...validEnvConfig } as Partial<typeof validEnvConfig>;
    delete invalidConfig.DATABASE_URL;

    expect(() => validateEnv(invalidConfig as Record<string, string>)).toThrow(
      "[Configuration Error]"
    );
  });
});
