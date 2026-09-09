/**
 * Swanford Academy — Paystack API Client
 * Master Specification Reference: Sections 6, 7, 15
 */

import { getEnv } from "@/lib/env";
import {
  PaystackInitializeInput,
  PaystackInitializeResult,
  PaystackVerifyResult,
  PaystackSettlementData,
} from "./types";

const PAYSTACK_BASE_URL = "https://api.paystack.co";
const DEFAULT_TIMEOUT_MS = 10000;

export class PaystackApiError extends Error {
  public readonly statusCode?: number;
  public readonly code?: string;

  constructor(message: string, statusCode?: number, code?: string) {
    super(message);
    this.name = "PaystackApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function getSecretKey(): string {
  const env = getEnv();
  const key = env.PAYSTACK_SECRET_KEY;
  if (!key || key.trim().length === 0) {
    throw new PaystackApiError("Paystack secret key is not configured.", 500, "PAYSTACK_KEY_MISSING");
  }
  return key.trim();
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new PaystackApiError("Connection to payment gateway timed out. Please try again.", 504, "GATEWAY_TIMEOUT");
    }
    throw new PaystackApiError(
      "Unable to communicate with the payment gateway. Please check your connection.",
      502,
      "GATEWAY_CONNECTION_ERROR"
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Initializes a transaction on Paystack and retrieves authorization URL.
 */
export async function initializeTransaction(input: PaystackInitializeInput): Promise<PaystackInitializeResult> {
  const secretKey = getSecretKey();

  // Paystack expects amount in Kobo as integer number
  const amountNumber = typeof input.amountKobo === "bigint" ? Number(input.amountKobo) : input.amountKobo;

  const body = {
    email: input.email.trim().toLowerCase(),
    amount: amountNumber,
    reference: input.reference.trim(),
    callback_url: input.callbackUrl,
    metadata: input.metadata || {},
  };

  const response = await fetchWithTimeout(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = await response.json();

  if (!response.ok || !json.status) {
    const message = json.message || "Failed to initialize payment transaction with Paystack.";
    throw new PaystackApiError(message, response.status, "PAYSTACK_INITIALIZATION_FAILED");
  }

  return {
    authorizationUrl: json.data.authorization_url,
    accessCode: json.data.access_code,
    reference: json.data.reference,
  };
}

/**
 * Verifies transaction directly with Paystack via server-to-server call.
 */
export async function verifyTransaction(reference: string): Promise<PaystackVerifyResult> {
  const secretKey = getSecretKey();

  const response = await fetchWithTimeout(
    `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference.trim())}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    }
  );

  const json = await response.json();

  if (!response.ok || !json.status) {
    const message = json.message || "Payment gateway verification could not be completed.";
    throw new PaystackApiError(message, response.status, "PAYSTACK_VERIFICATION_FAILED");
  }

  return json as PaystackVerifyResult;
}

/**
 * Fetches settlement details for a given settlement ID.
 */
export async function fetchSettlement(settlementId: string): Promise<PaystackSettlementData> {
  const secretKey = getSecretKey();

  const response = await fetchWithTimeout(
    `${PAYSTACK_BASE_URL}/settlement/${encodeURIComponent(settlementId.trim())}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    }
  );

  const json = await response.json();

  if (!response.ok || !json.status) {
    const message = json.message || "Failed to fetch settlement data from Paystack.";
    throw new PaystackApiError(message, response.status, "PAYSTACK_SETTLEMENT_FAILED");
  }

  return json.data as PaystackSettlementData;
}
