/**
 * Financial Precision & Serialization Engine (Kobo Minor Units)
 * Master Specification Reference: Sections 6, 7, 15, 24
 * Architecture Reference: docs/DATABASE_ARCHITECTURE_DESIGN.md
 *
 * CRITICAL ARCHITECTURAL RULES:
 * 1. All monetary values across the database, APIs, and business logic must be
 *    stored and calculated as integer Kobo (1 Naira = 100 Kobo).
 * 2. Database columns use PostgreSQL BIGINT and Prisma BigInt.
 * 3. Never use floating-point arithmetic for financial calculations.
 * 4. To prevent JavaScript `TypeError: Do not know how to serialize a BigInt` crashes
 *    and precision loss during API JSON transmission, BigInt values are converted
 *    to lossless numeric string representations in API DTOs.
 */

export type Kobo = bigint;

export const KOBO_PER_NAIRA = BigInt(100);

/**
 * Converts a Naira string or number into exact BigInt Kobo.
 * Handles strings like "102000", "102,000.50", "₦107,500.00".
 */
export function nairaToKoboBigInt(naira: string | number): bigint {
  if (typeof naira === "number") {
    if (!Number.isFinite(naira)) {
      throw new TypeError("Cannot convert non-finite number to Kobo");
    }
    // Convert to string to avoid floating point multiplication errors
    const fixed = naira.toFixed(2);
    return nairaToKoboBigInt(fixed);
  }

  const clean = naira.trim().replace(/,/g, "").replace(/^₦/, "");
  if (!clean || isNaN(Number(clean))) {
    throw new TypeError(`Invalid Naira string: "${naira}"`);
  }

  const parts = clean.split(".");
  const wholePart = BigInt(parts[0] || "0");
  const fractionalPart = (parts[1] || "").padEnd(2, "0").slice(0, 2);
  const koboPart = BigInt(fractionalPart || "0");

  const sign = wholePart < BigInt(0) ? BigInt(-1) : BigInt(1);
  return wholePart * KOBO_PER_NAIRA + sign * koboPart;
}

/**
 * Converts BigInt Kobo to major unit Naira number for display only.
 * WARNING: For visual formatting only; NEVER use output for accounting or ledger storage.
 */
export function koboToNairaNumber(kobo: bigint | number): number {
  const koboBig = BigInt(kobo);
  return Number(koboBig) / 100;
}

/**
 * Formats integer Kobo into a standardized Nigerian currency string (e.g. ₦102,000.00).
 */
export function formatNaira(
  kobo: bigint | number,
  options: { includeSymbol?: boolean; showDecimals?: boolean } = {}
): string {
  const { includeSymbol = true, showDecimals = true } = options;
  const koboBig = BigInt(kobo);

  const isNegative = koboBig < BigInt(0);
  const absKobo = isNegative ? -koboBig : koboBig;
  const wholeNaira = absKobo / KOBO_PER_NAIRA;
  const remainingKobo = absKobo % KOBO_PER_NAIRA;

  const formattedWhole = Number(wholeNaira).toLocaleString("en-NG");
  const formattedFraction = remainingKobo.toString().padStart(2, "0");

  const signStr = isNegative ? "-" : "";
  const symbolStr = includeSymbol ? "₦" : "";

  if (showDecimals) {
    return `${signStr}${symbolStr}${formattedWhole}.${formattedFraction}`;
  }
  return `${signStr}${symbolStr}${formattedWhole}`;
}

export const formatKoboToNaira = formatNaira;

/**
 * Safely sums multiple Kobo values using exact BigInt arithmetic.
 */
export function sumKoboBigInt(...amounts: (bigint | number)[]): bigint {
  return amounts.reduce<bigint>((acc, curr) => acc + BigInt(curr), BigInt(0));
}

/**
 * Computes outstanding balance: invoice amount - paid amount.
 */
export function computeOutstandingBalance(
  invoiceKobo: bigint | number,
  paidKobo: bigint | number
): bigint {
  return BigInt(invoiceKobo) - BigInt(paidKobo);
}

/**
 * Lossless DTO serialization: converts any object containing BigInt fields into
 * JSON-serializable primitives (BigInt converted to string).
 * Prevents JSON.stringify crashes without loss of precision.
 */
export function serializeBigInt<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "bigint") {
    return obj.toString() as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => serializeBigInt(item)) as unknown as T;
  }

  if (typeof obj === "object" && !(obj instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeBigInt(value);
    }
    return result as T;
  }

  return obj;
}

/**
 * Deserializes string or numeric kobo input back into typed BigInt.
 */
export function parseKoboFromDto(val: string | number | bigint): bigint {
  return BigInt(val);
}

// Backward compatibility helpers for numeric kobo inputs
export function nairaToKobo(naira: number | string): number {
  return Number(nairaToKoboBigInt(naira));
}

export function koboToNaira(kobo: number): number {
  return koboToNairaNumber(BigInt(kobo));
}

export function sumKobo(...amounts: number[]): number {
  return Number(sumKoboBigInt(...amounts.map(BigInt)));
}

export function isValidKoboAmount(kobo: unknown): boolean {
  if (typeof kobo === "bigint") return kobo >= BigInt(0);
  if (typeof kobo === "number") return Number.isInteger(kobo) && kobo >= 0;
  return false;
}
