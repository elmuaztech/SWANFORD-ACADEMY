/**
 * Swanford Academy — Payment Maintenance Lock Test Suite
 * Master Specification Reference: Sections 6, 7, 14, 21
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isPaymentMaintenanceActive,
  assertPaymentsAllowed,
  PaymentMaintenanceError,
} from "@/lib/security/payment_maintenance";
import { initializeTransaction } from "@/lib/paystack/client";
import { POST as handlePaymentSession } from "@/app/api/payments/session/route";
import { POST as handlePaymentInitialize } from "@/app/api/payments/initialize/route";
import { POST as handleAdmissionPaymentInit } from "@/app/api/admissions/payment/initialize/route";
import { POST as handlePaymentVerify } from "@/app/api/payments/verify/route";
import { POST as handleAdmissionPaymentVerify } from "@/app/api/admissions/payment/verify/route";
import { POST as handleWebhook } from "@/app/api/webhooks/paystack/route";
import { NextRequest } from "next/server";

describe("Payment Maintenance Gate — Core Logic & Bypass Prevention", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.PAYMENT_GATEWAY_MAINTENANCE_LOCK;
    delete process.env.PAYMENT_MAINTENANCE_MODE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("reports inactive when maintenance environment variables are unset or false", () => {
    expect(isPaymentMaintenanceActive()).toBe(false);
    expect(() => assertPaymentsAllowed()).not.toThrow();

    process.env.PAYMENT_GATEWAY_MAINTENANCE_LOCK = "false";
    expect(isPaymentMaintenanceActive()).toBe(false);
  });

  it("reports active when PAYMENT_GATEWAY_MAINTENANCE_LOCK is set to 'true' or '1'", () => {
    process.env.PAYMENT_GATEWAY_MAINTENANCE_LOCK = "true";
    expect(isPaymentMaintenanceActive()).toBe(true);

    process.env.PAYMENT_GATEWAY_MAINTENANCE_LOCK = "1";
    expect(isPaymentMaintenanceActive()).toBe(true);

    process.env.PAYMENT_GATEWAY_MAINTENANCE_LOCK = "false";
    process.env.PAYMENT_MAINTENANCE_MODE = "true";
    expect(isPaymentMaintenanceActive()).toBe(true);
  });

  it("throws PaymentMaintenanceError (503) when assertPaymentsAllowed() is called with lock active", () => {
    process.env.PAYMENT_GATEWAY_MAINTENANCE_LOCK = "true";
    expect(() => assertPaymentsAllowed()).toThrow(PaymentMaintenanceError);

    try {
      assertPaymentsAllowed();
    } catch (err) {
      expect(err).toBeInstanceOf(PaymentMaintenanceError);
      const maintErr = err as PaymentMaintenanceError;
      expect(maintErr.statusCode).toBe(503);
      expect(maintErr.code).toBe("PAYMENT_GATEWAY_MAINTENANCE");
    }
  });

  it("STRICT SECURITY RULE: Strictly forbids test bypass when live Paystack credentials (sk_live_) are configured", () => {
    process.env.PAYMENT_GATEWAY_MAINTENANCE_LOCK = "true";
    process.env.PAYSTACK_SECRET_KEY = "sk_live_production_secret_key_12345";
    process.env.PAYSTACK_PUBLIC_KEY = "pk_live_production_public_key_12345";
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";

    // Even if allowTestBypass is requested, it must throw because live keys are present!
    expect(() => assertPaymentsAllowed({ allowTestBypass: true })).toThrow(PaymentMaintenanceError);
    expect(() => assertPaymentsAllowed({ allowTestBypass: true })).toThrow(/strictly prohibited/);
  });

  it("STRICT SECURITY RULE: Strictly forbids test bypass in production environment even if keys look like test keys", () => {
    process.env.PAYMENT_GATEWAY_MAINTENANCE_LOCK = "true";
    process.env.PAYSTACK_SECRET_KEY = "sk_test_fake_secret_key_12345";
    process.env.PAYSTACK_PUBLIC_KEY = "pk_test_fake_public_key_12345";
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";

    expect(() => assertPaymentsAllowed({ allowTestBypass: true })).toThrow(PaymentMaintenanceError);
    expect(() => assertPaymentsAllowed({ allowTestBypass: true })).toThrow(/strictly prohibited in production/);
  });

  it("permits test bypass ONLY when test keys are used in non-production", () => {
    process.env.PAYMENT_GATEWAY_MAINTENANCE_LOCK = "true";
    process.env.PAYSTACK_SECRET_KEY = "sk_test_valid_test_key_12345";
    process.env.PAYSTACK_PUBLIC_KEY = "pk_test_valid_test_key_12345";
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";

    expect(() => assertPaymentsAllowed({ allowTestBypass: true })).not.toThrow();
  });
});

describe("Payment Maintenance Gate — Paystack Client Layer Protection", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("initializeTransaction() rejects immediately without making any outbound gateway requests when lock is active", async () => {
    process.env.PAYMENT_GATEWAY_MAINTENANCE_LOCK = "true";
    process.env.PAYSTACK_SECRET_KEY = "sk_test_mock_123";

    const fetchSpy = vi.spyOn(global, "fetch");

    await expect(
      initializeTransaction({
        email: "test@example.com",
        amountKobo: 50000n,
        reference: "SWAN-TEST-001",
        callbackUrl: "http://localhost:3000/callback",
      })
    ).rejects.toThrow(PaymentMaintenanceError);

    // Verify zero outbound HTTP requests were made
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("Payment Maintenance Gate — API Route Handlers", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.PAYMENT_GATEWAY_MAINTENANCE_LOCK = "true";
    process.env.APP_URL = "http://localhost:3000";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("POST /api/payments/session returns HTTP 503 when lock is active", async () => {
    const req = new NextRequest("http://localhost:3000/api/payments/session", {
      method: "POST",
      body: JSON.stringify({
        targetType: "APPLICATION_FEE",
        targetId: "00000000-0000-0000-0000-000000000000",
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    const res = await handlePaymentSession(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.maintenance).toBe(true);
    expect(body.code).toBe("PAYMENT_GATEWAY_MAINTENANCE");
  });

  it("POST /api/payments/initialize returns HTTP 503 when lock is active", async () => {
    const req = new NextRequest("http://localhost:3000/api/payments/initialize", {
      method: "POST",
      body: JSON.stringify({
        sessionToken: "dummy-session-token",
        targetType: "APPLICATION_FEE",
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    const res = await handlePaymentInitialize(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.maintenance).toBe(true);
    expect(body.code).toBe("PAYMENT_GATEWAY_MAINTENANCE");
  });

  it("POST /api/admissions/payment/initialize returns HTTP 503 when lock is active", async () => {
    const req = new NextRequest("http://localhost:3000/api/admissions/payment/initialize", {
      method: "POST",
      body: JSON.stringify({
        guardianFullName: "Parent Test",
        guardianEmail: "parent@example.com",
        guardianPhone: "08012345678",
        studentFullName: "Student Test",
        admissionCycleId: "00000000-0000-0000-0000-000000000000",
        programmeId: "00000000-0000-0000-0000-000000000000",
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    const res = await handleAdmissionPaymentInit(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.maintenance).toBe(true);
    expect(body.code).toBe("PAYMENT_GATEWAY_MAINTENANCE");
  });

  it("UNBLOCKED: Verification endpoints (payments/verify & admissions/verify) are NOT blocked by the maintenance lock", async () => {
    // Calling payments/verify without body returns 400 (Bad Request), NOT 503 (Maintenance)!
    const reqPaymentsVerify = new NextRequest("http://localhost:3000/api/payments/verify", {
      method: "POST",
      body: JSON.stringify({ reference: "" }),
      headers: { "Content-Type": "application/json" },
    });
    const resVerify = await handlePaymentVerify(reqPaymentsVerify);
    expect(resVerify.status).not.toBe(503);

    const reqAdmVerify = new NextRequest("http://localhost:3000/api/admissions/payment/verify", {
      method: "POST",
      body: JSON.stringify({ reference: "" }),
      headers: { "Content-Type": "application/json" },
    });
    const resAdmVerify = await handleAdmissionPaymentVerify(reqAdmVerify);
    expect(resAdmVerify.status).not.toBe(503);
  });

  it("UNBLOCKED: Webhook endpoint (POST /api/webhooks/paystack) is NOT blocked by the maintenance lock", async () => {
    // Calling webhook without signature header returns 400, NOT 503!
    const reqWebhook = new NextRequest("http://localhost:3000/api/webhooks/paystack", {
      method: "POST",
      body: JSON.stringify({ event: "charge.success" }),
    });
    const resWebhook = await handleWebhook(reqWebhook);
    expect(resWebhook.status).not.toBe(503);
  });
});
