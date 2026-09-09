/**
 * Swanford Academy — Payment Reference Generator
 * Master Specification Reference: Section 6, 7, 15
 *
 * Requirements:
 * 1. Unique, collision-resistant references.
 * 2. Allowed Paystack characters: alphanumeric, dashes, underscores, dots, equals.
 * 3. Never rely on Date.now() alone.
 * 4. Human-identifiable prefix: SWN-APP-... or SWN-INV-...
 */

import crypto from "crypto";
import { PaymentTargetType } from "@prisma/client";

export const PAYSTACK_REFERENCE_REGEX = /^[a-zA-Z0-9_\-\.\=]{10,100}$/;
export const SWANFORD_REFERENCE_REGEX = /^SWN-(APP|INV)-([a-zA-Z0-9_-]+)-([A-Z0-9]+)-([A-Z0-9]+)$/;

export function generatePaymentReference(
  targetType: "APP" | "INV" | PaymentTargetType,
  targetIdentifier: string
): string {
  const typeCode =
    targetType === PaymentTargetType.APPLICATION_FEE || targetType === "APP"
      ? "APP"
      : "INV";

  // Sanitize identifier to only allowed characters
  const cleanId = targetIdentifier
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 32);

  // Time component: high-resolution millisecond timestamp encoded in base36
  const timePart = Date.now().toString(36).toUpperCase();

  // Cryptographic random component: 12 hex characters (6 bytes of cryptographic entropy)
  const randomPart = crypto.randomBytes(6).toString("hex").toUpperCase();

  const ref = `SWN-${typeCode}-${cleanId ? `${cleanId}-` : ""}${timePart}-${randomPart}`;

  if (!isValidPaystackReference(ref)) {
    throw new Error(`Generated invalid Paystack reference format: ${ref}`);
  }

  return ref;
}

export function generatePaystackReference(
  targetType: PaymentTargetType | "APP" | "INV",
  targetIdentifier: string
): string {
  return generatePaymentReference(targetType, targetIdentifier);
}

export function parsePaystackReference(ref: unknown): { targetType: PaymentTargetType; targetId: string } | null {
  if (typeof ref !== "string") return null;
  const match = ref.trim().match(SWANFORD_REFERENCE_REGEX);
  if (!match) return null;

  const targetType = match[1] === "APP" ? PaymentTargetType.APPLICATION_FEE : PaymentTargetType.INVOICE;
  const targetId = match[2];

  return { targetType, targetId };
}

export function isValidPaystackReference(ref: unknown): ref is string {
  if (typeof ref !== "string") return false;
  return PAYSTACK_REFERENCE_REGEX.test(ref.trim());
}

export function isValidSwanfordReference(ref: unknown): ref is string {
  if (typeof ref !== "string") return false;
  return SWANFORD_REFERENCE_REGEX.test(ref.trim());
}

