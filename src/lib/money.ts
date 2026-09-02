/**
 * Financial Precision Engine (Kobo Minor Units)
 * Master Specification Reference: Sections 6, 7, 15, 24
 *
 * CRITICAL ARCHITECTURAL RULE:
 * All monetary amounts in Swanford Academy must be stored and computed as
 * integer minor units (kobo: 1 Naira = 100 kobo).
 *
 * Floating-point arithmetic (e.g. JavaScript Number 0.1 + 0.2) causes rounding
 * drift and financial discrepancies. This module guarantees exact integer math
 * for all balance, invoice, and payment calculations.
 */

export type Kobo = number; // Represents whole kobo (integer)

export const KOBO_PER_NAIRA = 100;

/**
 * Converts a Naira string or number into exact integer Kobo.
 * Example: "102000" -> 10200000, "107500.50" -> 10750050
 */
export function nairaToKobo(naira: number | string): Kobo {
  if (typeof naira === "number") {
    if (!Number.isFinite(naira)) {
      throw new TypeError("Cannot convert non-finite number to Kobo");
    }
    // Round to nearest integer after multiplying to handle potential floating inputs
    return Math.round(naira * KOBO_PER_NAIRA);
  }

  const clean = naira.trim().replace(/,/g, "").replace(/^₦/, "");
  if (!clean || isNaN(Number(clean))) {
    throw new TypeError(`Invalid Naira string: "${naira}"`);
  }

  const parts = clean.split(".");
  const wholePart = parseInt(parts[0] || "0", 10);
  const fractionalPart = (parts[1] || "").padEnd(2, "0").slice(0, 2);
  const koboPart = parseInt(fractionalPart, 10);

  const sign = wholePart < 0 ? -1 : 1;
  return wholePart * KOBO_PER_NAIRA + sign * koboPart;
}

/**
 * Converts integer Kobo to a floating-point Naira representation.
 * NOTE: For display and API transmission only; never use the output for ledger calculations.
 */
export function koboToNaira(kobo: Kobo): number {
  if (!Number.isInteger(kobo)) {
    throw new TypeError(`Kobo amount must be an integer, received: ${kobo}`);
  }
  return kobo / KOBO_PER_NAIRA;
}

/**
 * Formats integer Kobo into a standardized Nigerian currency string (e.g., ₦102,000.00).
 */
export function formatNaira(
  kobo: Kobo,
  options: { includeSymbol?: boolean; showDecimals?: boolean } = {}
): string {
  const { includeSymbol = true, showDecimals = true } = options;

  if (!Number.isInteger(kobo)) {
    throw new TypeError(`Expected integer kobo value, received: ${kobo}`);
  }

  const isNegative = kobo < 0;
  const absKobo = Math.abs(kobo);
  const wholeNaira = Math.floor(absKobo / KOBO_PER_NAIRA);
  const remainingKobo = absKobo % KOBO_PER_NAIRA;

  const formattedWhole = wholeNaira.toLocaleString("en-NG");
  const formattedFraction = remainingKobo.toString().padStart(2, "0");

  const signStr = isNegative ? "-" : "";
  const symbolStr = includeSymbol ? "₦" : "";

  if (showDecimals) {
    return `${signStr}${symbolStr}${formattedWhole}.${formattedFraction}`;
  }
  return `${signStr}${symbolStr}${formattedWhole}`;
}

/**
 * Safely adds multiple Kobo amounts.
 */
export function sumKobo(...amounts: Kobo[]): Kobo {
  return amounts.reduce((acc, curr) => {
    if (!Number.isInteger(curr)) {
      throw new TypeError(`Every amount must be an integer kobo value, received: ${curr}`);
    }
    return acc + curr;
  }, 0);
}

/**
 * Computes remaining balance from total invoice amount and total paid amount.
 * Balance = Invoice Amount - Paid Amount.
 */
export function computeOutstandingBalance(invoiceKobo: Kobo, paidKobo: Kobo): Kobo {
  if (!Number.isInteger(invoiceKobo) || !Number.isInteger(paidKobo)) {
    throw new TypeError("Both invoiceKobo and paidKobo must be integer values");
  }
  return invoiceKobo - paidKobo;
}

/**
 * Validates that an amount is a valid non-negative integer kobo value.
 */
export function isValidKoboAmount(kobo: unknown): kobo is Kobo {
  return typeof kobo === "number" && Number.isInteger(kobo) && kobo >= 0;
}
