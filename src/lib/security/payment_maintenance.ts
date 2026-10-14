/**
 * Swanford Academy — Payment Maintenance Gate
 * Master Specification Reference: Sections 6, 7, 14, 21
 *
 * Operational Security Standard:
 * 1. Blocks new real payment initialization during scheduled maintenance or production verification.
 * 2. Defense-in-depth: Enforced at both API route handlers and gateway client layer.
 * 3. Never blocks payment verification, reconciliation, webhooks, invoice viewing, or receipt access.
 * 4. Strictly forbids test-mode bypass when configured with live gateway credentials (sk_live_ / pk_live_).
 */

export class PaymentMaintenanceError extends Error {
  public readonly statusCode = 503;
  public readonly code = "PAYMENT_GATEWAY_MAINTENANCE";

  constructor(
    message = "Online payment processing is temporarily undergoing scheduled maintenance. Please check back shortly. Your application details and historical records are safely preserved."
  ) {
    super(message);
    this.name = "PaymentMaintenanceError";
  }
}

export interface PaymentGateCheckOptions {
  /**
   * Only honored if credentials are verified test keys (sk_test_) in non-production.
   */
  allowTestBypass?: boolean;
}

/**
 * Checks whether the server-level payment maintenance lock is currently active.
 *
 * Supported flags:
 * - PAYMENT_GATEWAY_MAINTENANCE_LOCK="true" | "1"
 * - PAYMENT_MAINTENANCE_MODE="true" | "1"
 */
export function isPaymentMaintenanceActive(): boolean {
  const isFlagTrue = (val?: string) => {
    const trimmed = (val || "").trim().toLowerCase();
    return trimmed === "true" || trimmed === "1";
  };

  return (
    isFlagTrue(process.env.PAYMENT_GATEWAY_MAINTENANCE_LOCK) ||
    isFlagTrue(process.env.PAYMENT_MAINTENANCE_MODE)
  );
}

/**
 * Asserts that payment initialization is permitted.
 * Throws PaymentMaintenanceError if the maintenance lock is active.
 *
 * Security Invariant:
 * Even if allowTestBypass is requested, it is REJECTED if:
 * 1. The configured secret key starts with 'sk_live_'
 * 2. The configured public key starts with 'pk_live_'
 * 3. NODE_ENV === 'production'
 */
export function assertPaymentsAllowed(options: PaymentGateCheckOptions = {}): void {
  if (!isPaymentMaintenanceActive()) {
    return;
  }

  if (options.allowTestBypass) {
    const secretKey = (process.env.PAYSTACK_SECRET_KEY || "").trim();
    const publicKey = (process.env.PAYSTACK_PUBLIC_KEY || "").trim();
    const isLiveKey = secretKey.startsWith("sk_live_") || publicKey.startsWith("pk_live_");
    const isProduction = process.env.NODE_ENV === "production";

    if (isLiveKey || isProduction) {
      throw new PaymentMaintenanceError(
        "Payment maintenance is active. Test bypass is strictly prohibited in production or when live Paystack credentials are configured."
      );
    }

    // Verified test keys (sk_test_) in non-production environment: allowed for isolated automated test runs
    return;
  }

  throw new PaymentMaintenanceError();
}
