/**
 * Swanford Academy — Payment Authorization & Session Manager
 * Master Specification Reference: Sections 7, 15, 24
 *
 * Mandatory Requirement 3 & 4:
 * 1. Never authorize payment initialization or verification simply because caller knows an ID.
 * 2. Strict mutual exclusivity:
 *    - APPLICATION_FEE => exactly one applicationId, no invoiceId.
 *    - INVOICE => exactly one invoiceId, no applicationId.
 * 3. Cryptographically bound, expiring, server-verifiable session token.
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { PaymentTargetType, Prisma } from "@prisma/client";
import { getEnv } from "@/lib/env";
import { AuthorizationError } from "@/lib/auth/authorization";

export interface CreatePaymentSessionParams {
  targetType: PaymentTargetType;
  applicationId?: string | null;
  invoiceId?: string | null;
  payerEmail: string;
  expectedAmountKobo: bigint;
  expiresInHours?: number;
  client?: Prisma.TransactionClient | typeof prisma;
}

export interface VerifySessionTokenParams {
  token: string;
  targetType: PaymentTargetType;
  targetId: string; // applicationId or invoiceId
  client?: Prisma.TransactionClient | typeof prisma;
}

/**
 * Creates an authoritative payment session and returns the secure client token.
 */
export async function createPaymentSession(params: CreatePaymentSessionParams) {
  const {
    targetType,
    applicationId,
    invoiceId,
    payerEmail,
    expectedAmountKobo,
    expiresInHours = 24,
    client = prisma,
  } = params;

  // 1. Mandatory mutual exclusivity check in application logic (backed by DB CHECK constraint)
  if (targetType === PaymentTargetType.APPLICATION_FEE) {
    if (!applicationId || invoiceId) {
      throw new AuthorizationError(
        "APPLICATION_FEE payment session requires an applicationId and must not have an invoiceId.",
        400,
        "INVALID_SESSION_TARGET"
      );
    }
  } else if (targetType === PaymentTargetType.INVOICE) {
    if (!invoiceId || applicationId) {
      throw new AuthorizationError(
        "INVOICE payment session requires an invoiceId and must not have an applicationId.",
        400,
        "INVALID_SESSION_TARGET"
      );
    }
  } else {
    throw new AuthorizationError("Unsupported payment target type.", 400, "INVALID_TARGET_TYPE");
  }

  if (expectedAmountKobo <= BigInt(0)) {
    throw new AuthorizationError("Expected amount must be greater than 0 Kobo.", 400, "INVALID_AMOUNT");
  }

  // 2. Generate cryptographically strong random token
  const rawToken = crypto.randomBytes(32).toString("hex");
  const env = getEnv();
  const tokenHash = crypto
    .createHmac("sha256", env.SESSION_SECRET)
    .update(rawToken)
    .digest("hex");

  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  // 3. Persist session
  const session = await client.paymentSession.create({
    data: {
      tokenHash,
      targetType,
      applicationId: applicationId || null,
      invoiceId: invoiceId || null,
      payerEmail: payerEmail.trim().toLowerCase(),
      expectedAmountKobo,
      currency: "NGN",
      expiresAt,
    },
  });

  return {
    session,
    token: rawToken, // Provided to client for authorized authorization header
  };
}

/**
 * Validates a payment session token against database state and target entity.
 */
export async function verifyPaymentSessionToken(params: VerifySessionTokenParams) {
  const { token, targetType, targetId, client = prisma } = params;

  if (!token || typeof token !== "string" || token.trim().length < 16) {
    throw new AuthorizationError("Invalid or missing payment authorization token.", 401, "UNAUTHORIZED_PAYMENT_TOKEN");
  }

  const env = getEnv();
  const tokenHash = crypto
    .createHmac("sha256", env.SESSION_SECRET)
    .update(token.trim())
    .digest("hex");

  const session = await client.paymentSession.findUnique({
    where: { tokenHash },
    include: {
      application: true,
      invoice: true,
    },
  });

  if (!session) {
    throw new AuthorizationError("Payment session not found or invalid token.", 401, "SESSION_NOT_FOUND");
  }

  // Check target type
  if (session.targetType !== targetType) {
    throw new AuthorizationError("Payment session target type mismatch.", 403, "SESSION_TARGET_MISMATCH");
  }

  // Check target ID
  const expectedId = targetType === PaymentTargetType.APPLICATION_FEE ? session.applicationId : session.invoiceId;
  if (expectedId !== targetId) {
    throw new AuthorizationError("Payment session is not authorized for the requested entity.", 403, "SESSION_ENTITY_MISMATCH");
  }

  // Check expiration
  if (new Date() > session.expiresAt) {
    throw new AuthorizationError("Payment session has expired. Please initiate a new payment session.", 401, "SESSION_EXPIRED");
  }

  return session;
}

/**
 * Marks a payment session as consumed after checkout completion.
 */
export async function markPaymentSessionUsed(
  sessionId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  return client.paymentSession.update({
    where: { id: sessionId },
    data: { usedAt: new Date() },
  });
}
