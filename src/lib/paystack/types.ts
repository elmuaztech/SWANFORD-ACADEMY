/**
 * Swanford Academy — Paystack Gateway Type Definitions & Status Mapping
 * Master Specification Reference: Sections 6, 7, 15, 24
 */

import { GatewayTransactionStatus, PaymentTargetType } from "@prisma/client";

/**
 * Maps raw Paystack transaction status string to strictly typed GatewayTransactionStatus.
 * CRITICAL RULE: Unknown/unrecognized statuses must NEVER be mapped to SUCCESS.
 */
export function mapPaystackStatus(status: unknown): GatewayTransactionStatus {
  if (typeof status !== "string") {
    return GatewayTransactionStatus.FAILED;
  }

  const normalized = status.trim().toLowerCase();

  switch (normalized) {
    case "success":
      return GatewayTransactionStatus.SUCCESS;
    case "failed":
      return GatewayTransactionStatus.FAILED;
    case "abandoned":
      return GatewayTransactionStatus.ABANDONED;
    case "ongoing":
      return GatewayTransactionStatus.ONGOING;
    case "pending":
      return GatewayTransactionStatus.PENDING;
    case "processing":
      return GatewayTransactionStatus.PROCESSING;
    case "queued":
      return GatewayTransactionStatus.QUEUED;
    case "reversed":
      return GatewayTransactionStatus.REVERSED;
    default:
      // Unknown or unsupported status string -> default to FAILED, never SUCCESS
      return GatewayTransactionStatus.FAILED;
  }
}

export function isSuccessfulPaystackStatus(status: unknown): boolean {
  return typeof status === "string" && status.trim().toLowerCase() === "success";
}

export interface PaystackInitializeInput {
  email: string;
  amountKobo: bigint | number;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}

export interface PaystackInitializeResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

export interface PaystackTransactionData {
  id: number | string;
  domain?: string;
  status: string;
  reference: string;
  amount: number; // in kobo
  message?: string | null;
  gateway_response?: string | null;
  paid_at?: string | null;
  created_at?: string;
  channel?: string | null;
  currency?: string;
  ip_address?: string | null;
  metadata?: Record<string, unknown>;
  fees?: number | null; // in kobo
  fees_split?: unknown;
  customer?: {
    id?: number;
    first_name?: string | null;
    last_name?: string | null;
    email?: string;
    customer_code?: string;
    phone?: string | null;
  };
  authorization?: {
    authorization_code?: string;
    bin?: string;
    last4?: string;
    exp_month?: string;
    exp_year?: string;
    channel?: string;
    card_type?: string;
    bank?: string;
    country_code?: string;
    brand?: string;
    reusable?: boolean;
    signature?: string;
  };
}

export interface PaystackVerifyResult {
  status: boolean;
  message: string;
  data: PaystackTransactionData;
}

export interface PaystackWebhookPayload {
  event: string;
  data: PaystackTransactionData;
  id?: string | number;
}

export interface PaystackSettlementData {
  id: string | number;
  domain?: string;
  status: string;
  settled_at: string;
  gross_amount: number; // in kobo
  total_fees: number; // in kobo
  net_amount: number; // in kobo
  bank_name?: string | null;
  bank_account_number?: string | null;
  transactions?: Array<{
    id: number;
    reference: string;
    amount: number;
    fees: number;
  }>;
}

export interface ProcessTransactionResult {
  success: boolean;
  status: GatewayTransactionStatus;
  reference: string;
  targetType: PaymentTargetType;
  targetId: string;
  amountKobo: bigint;
  schoolPaymentId?: string | null;
  receiptNumber?: string | null;
  message: string;
  alreadyProcessed?: boolean;
}
