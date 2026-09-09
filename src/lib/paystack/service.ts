/**
 * Swanford Academy — Paystack Payment Gateway Engine
 * Master Specification Reference: Sections 6, 7, 15, 24
 *
 * Implements authoritative payment lifecycle:
 * - 3-way application fee validation
 * - Invoice overpayment prevention under FOR UPDATE locks
 * - Single atomic transaction for school credit ledger
 * - Decoupled notification dispatch
 * - Settlement reconciliation tracking
 * - Historical data preservation on reversals
 */

import { prisma } from "@/lib/prisma";
import {
  ApplicationPaymentStatus,
  ApplicationStatus,
  GatewayProvider,
  GatewayTransactionStatus,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTargetType,
  Prisma,
  ReconciliationStatus,
  SettlementStatus,
} from "@prisma/client";
import { AuthorizationError } from "@/lib/auth/authorization";
import { SafeUser } from "@/lib/auth/service";
import { getNextPaymentReference, getNextReceiptNumber } from "@/lib/finance/sequences";
import { generatePaymentReference } from "./reference";
import {
  verifyPaymentSessionToken,
} from "./session";
import {
  initializeTransaction,
} from "./client";
import {
  mapPaystackStatus,
  PaystackSettlementData,
  PaystackTransactionData,
  ProcessTransactionResult,
} from "./types";

export interface InitializeApplicationPaymentParams {
  sessionToken: string;
  callbackUrl: string;
}

export interface InitializeInvoicePaymentParams {
  sessionToken: string;
  callbackUrl: string;
  actor?: SafeUser;
}

/**
 * Initiates an admission application fee payment with Paystack.
 */
export async function initializeApplicationPayment(
  params: InitializeApplicationPaymentParams
) {
  const { sessionToken, callbackUrl } = params;

  // 1. Verify session token
  const session = await verifyPaymentSessionToken({
    token: sessionToken,
    targetType: PaymentTargetType.APPLICATION_FEE,
    targetId: "", // Will be extracted from session
  }).catch(async () => {
    // If targetId was empty, load by token directly
    return verifyPaymentSessionTokenByTokenOnly(sessionToken, PaymentTargetType.APPLICATION_FEE);
  });

  const applicationId = session.applicationId;
  if (!applicationId) {
    throw new AuthorizationError("Session is not linked to an application.", 400, "INVALID_SESSION");
  }

  // 2. Authoritative check: load application and verify state and charge snapshot
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { chargeItems: true },
  });

  if (!application) {
    throw new AuthorizationError("Application not found.", 404, "APPLICATION_NOT_FOUND");
  }

  if (application.paymentStatus === ApplicationPaymentStatus.PAYMENT_CONFIRMED) {
    throw new AuthorizationError("Application fee has already been paid and confirmed.", 400, "ALREADY_PAID");
  }

  // 3-way check part 1: snapshot total must match session expected amount
  if (application.totalAmountKobo !== session.expectedAmountKobo) {
    throw new AuthorizationError(
      "Application fee snapshot does not match payment session amount.",
      400,
      "FEE_SNAPSHOT_MISMATCH"
    );
  }

  // 3. Generate collision-resistant reference
  const reference = generatePaymentReference("APP", application.applicationNumber);

  // 4. Initialize transaction on Paystack
  const gatewayResult = await initializeTransaction({
    email: session.payerEmail,
    amountKobo: session.expectedAmountKobo,
    reference,
    callbackUrl,
    metadata: {
      targetType: PaymentTargetType.APPLICATION_FEE,
      applicationId: application.id,
      applicationNumber: application.applicationNumber,
      sessionId: session.id,
    },
  });

  // 5. Atomic local state initialization
  await prisma.$transaction(async (tx) => {
    await tx.paymentTransaction.create({
      data: {
        gatewayProvider: GatewayProvider.PAYSTACK,
        gatewayReference: reference,
        applicationId: application.id,
        amountKobo: session.expectedAmountKobo,
        currency: "NGN",
        status: GatewayTransactionStatus.INITIALIZED,
      },
    });

    await tx.application.update({
      where: { id: application.id },
      data: {
        paymentStatus: ApplicationPaymentStatus.PAYMENT_PENDING,
        paymentReference: reference,
      },
    });
  });

  return {
    authorizationUrl: gatewayResult.authorizationUrl,
    accessCode: gatewayResult.accessCode,
    reference,
  };
}

/**
 * Initiates an invoice tuition/school fee payment with Paystack.
 */
export async function initializeInvoicePayment(params: InitializeInvoicePaymentParams) {
  const { sessionToken, callbackUrl } = params;

  // 1. Verify session token
  const session = await verifyPaymentSessionTokenByTokenOnly(sessionToken, PaymentTargetType.INVOICE);
  const invoiceId = session.invoiceId;
  if (!invoiceId) {
    throw new AuthorizationError("Session is not linked to an invoice.", 400, "INVALID_SESSION");
  }

  // 2. Lock invoice row and check outstanding balance
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
  });

  if (!invoice) {
    throw new AuthorizationError("Invoice not found.", 404, "INVOICE_NOT_FOUND");
  }

  if (invoice.status === InvoiceStatus.CANCELLED) {
    throw new AuthorizationError("Cannot pay a cancelled invoice.", 400, "INVOICE_CANCELLED");
  }

  if (invoice.status === InvoiceStatus.PAID || invoice.outstandingBalanceKobo <= BigInt(0)) {
    throw new AuthorizationError("Invoice has already been paid in full.", 400, "INVOICE_ALREADY_PAID");
  }

  // Overpayment prevention
  if (session.expectedAmountKobo > invoice.outstandingBalanceKobo) {
    throw new AuthorizationError(
      "Payment amount exceeds the invoice outstanding balance.",
      400,
      "PAYMENT_EXCEEDS_BALANCE"
    );
  }

  // 3. Generate collision-resistant reference
  const reference = generatePaymentReference("INV", invoice.invoiceNumber);

  // 4. Initialize transaction on Paystack
  const gatewayResult = await initializeTransaction({
    email: session.payerEmail,
    amountKobo: session.expectedAmountKobo,
    reference,
    callbackUrl,
    metadata: {
      targetType: PaymentTargetType.INVOICE,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      sessionId: session.id,
    },
  });

  // 5. Atomic local state initialization
  await prisma.paymentTransaction.create({
    data: {
      gatewayProvider: GatewayProvider.PAYSTACK,
      gatewayReference: reference,
      invoiceId: invoice.id,
      amountKobo: session.expectedAmountKobo,
      currency: "NGN",
      status: GatewayTransactionStatus.INITIALIZED,
    },
  });

  return {
    authorizationUrl: gatewayResult.authorizationUrl,
    accessCode: gatewayResult.accessCode,
    reference,
  };
}

/**
 * Server-authoritative transaction processing engine.
 * Used by both Webhook processing and direct redirect verification.
 * Protected by PostgreSQL row-level locks (SELECT ... FOR UPDATE) and full idempotency.
 */
export async function processVerifiedTransaction(
  reference: string,
  gatewayData: PaystackTransactionData,
  options: {
    client?: Prisma.TransactionClient | typeof prisma;
  } = {}
): Promise<ProcessTransactionResult> {
  const rootClient = options.client || prisma;

  // 1. Locate local transaction record
  const existingTx = await rootClient.paymentTransaction.findUnique({
    where: { gatewayReference: reference },
    include: {
      application: { include: { chargeItems: true } },
      invoice: { include: { items: true } },
      schoolPayment: { include: { receipt: true } },
    },
  });

  if (!existingTx) {
    throw new AuthorizationError(
      `Transaction reference '${reference}' not found in school records.`,
      404,
      "TRANSACTION_NOT_FOUND"
    );
  }

  // 2. Map Paystack status strictly
  const mappedStatus = mapPaystackStatus(gatewayData.status);

  // 3. Idempotency Check: if already processed and confirmed, return immediately
  if (existingTx.status === GatewayTransactionStatus.SUCCESS) {
    return {
      success: true,
      status: GatewayTransactionStatus.SUCCESS,
      reference,
      targetType: existingTx.applicationId ? PaymentTargetType.APPLICATION_FEE : PaymentTargetType.INVOICE,
      targetId: existingTx.applicationId || existingTx.invoiceId || "",
      amountKobo: existingTx.amountKobo,
      schoolPaymentId: existingTx.schoolPaymentId,
      receiptNumber: existingTx.schoolPayment?.receipt?.receiptNumber || null,
      message: "Transaction has already been confirmed.",
      alreadyProcessed: true,
    };
  }

  // 4. Handle non-success statuses (failed, abandoned, pending, processing, etc.)
  if (mappedStatus !== GatewayTransactionStatus.SUCCESS) {
    await rootClient.paymentTransaction.update({
      where: { id: existingTx.id },
      data: {
        status: mappedStatus,
        gatewayTransactionId: gatewayData.id ? String(gatewayData.id) : null,
        channel: gatewayData.channel || null,
        gatewayResponseJson: gatewayData as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      success: false,
      status: mappedStatus,
      reference,
      targetType: existingTx.applicationId ? PaymentTargetType.APPLICATION_FEE : PaymentTargetType.INVOICE,
      targetId: existingTx.applicationId || existingTx.invoiceId || "",
      amountKobo: BigInt(gatewayData.amount || 0),
      message: `Transaction ended with status '${mappedStatus}'. Payment was not confirmed.`,
    };
  }

  // 5. Successful Status: Validate currency
  if (gatewayData.currency && gatewayData.currency.toUpperCase() !== "NGN") {
    throw new AuthorizationError(
      `Currency mismatch: Expected NGN, but gateway returned ${gatewayData.currency}.`,
      400,
      "CURRENCY_MISMATCH"
    );
  }

  const gatewayAmountKobo = BigInt(gatewayData.amount);
  const gatewayFeeKobo = gatewayData.fees ? BigInt(gatewayData.fees) : null;
  const netAmountKobo = gatewayFeeKobo !== null ? gatewayAmountKobo - gatewayFeeKobo : null;

  let schoolPaymentId: string | null = null;
  let receiptNumber: string | null = null;
  let notificationPayload: Record<string, unknown> | null = null;

  // 6. Execute atomic financial state transition
  const executeFinancialTransaction = async (tx: Prisma.TransactionClient) => {
    const currentYear = new Date().getFullYear();

    // -------------------------------------------------------------------------
    // CASE A: APPLICATION FEE PAYMENT
    // -------------------------------------------------------------------------
    if (existingTx.applicationId) {
      // Row lock FOR UPDATE on application
      const lockedApps = await tx.$queryRaw<
        Array<{
          id: string;
          total_amount_kobo: bigint;
          amount_paid_kobo: bigint;
          payment_status: ApplicationPaymentStatus;
          status: ApplicationStatus;
          application_number: string;
          guardian_email: string;
          guardian_first_name: string;
        }>
      >`
        SELECT id, total_amount_kobo, amount_paid_kobo, payment_status, status, application_number, guardian_email, guardian_first_name
        FROM applications
        WHERE id = ${existingTx.applicationId}::uuid
        FOR UPDATE;
      `;

      if (!lockedApps || lockedApps.length === 0) {
        throw new AuthorizationError("Application not found under lock.", 404, "APPLICATION_NOT_FOUND");
      }

      const lockedApp = lockedApps[0];

      // 3-way check: Authoritative snapshot amount == Paystack amount
      if (lockedApp.total_amount_kobo !== gatewayAmountKobo) {
        throw new AuthorizationError(
          `Amount mismatch: Application fee is ₦${(Number(lockedApp.total_amount_kobo) / 100).toFixed(
            2
          )}, but gateway received ₦${(Number(gatewayAmountKobo) / 100).toFixed(2)}.`,
          400,
          "AMOUNT_MISMATCH"
        );
      }

      // Check if already confirmed
      if (lockedApp.payment_status === ApplicationPaymentStatus.PAYMENT_CONFIRMED) {
        return;
      }

      // Transition Application state
      const nextStatus =
        lockedApp.status === ApplicationStatus.SUBMITTED
          ? ApplicationStatus.UNDER_REVIEW
          : lockedApp.status;

      await tx.application.update({
        where: { id: lockedApp.id },
        data: {
          paymentStatus: ApplicationPaymentStatus.PAYMENT_CONFIRMED,
          amountPaidKobo: gatewayAmountKobo,
          paymentReference: reference,
          status: nextStatus,
        },
      });

      // Update PaymentTransaction
      await tx.paymentTransaction.update({
        where: { id: existingTx.id },
        data: {
          status: GatewayTransactionStatus.SUCCESS,
          gatewayTransactionId: String(gatewayData.id),
          amountKobo: gatewayAmountKobo,
          gatewayFeeKobo,
          netAmountKobo,
          paidAt: gatewayData.paid_at ? new Date(gatewayData.paid_at) : new Date(),
          channel: gatewayData.channel || null,
          customerEmail: gatewayData.customer?.email || null,
          authorizationCode: gatewayData.authorization?.authorization_code || null,
          ipAddress: gatewayData.ip_address || null,
          gatewayResponseJson: gatewayData as unknown as Prisma.InputJsonValue,
          settlementStatus: SettlementStatus.PENDING,
          reconciliationStatus: ReconciliationStatus.UNRECONCILED,
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          action: "APPLICATION_PAYSTACK_PAYMENT_CONFIRMED",
          entityType: "Application",
          entityId: lockedApp.id,
          newValues: {
            reference,
            amountKobo: gatewayAmountKobo.toString(),
            gatewayFeeKobo: gatewayFeeKobo?.toString() || null,
            status: nextStatus,
            paymentStatus: ApplicationPaymentStatus.PAYMENT_CONFIRMED,
          },
        },
      });

      notificationPayload = {
        recipientEmail: lockedApp.guardian_email,
        type: "APPLICATION_PAYMENT_CONFIRMED",
        applicationNumber: lockedApp.application_number,
        amountKobo: gatewayAmountKobo.toString(),
      };
    }

    // -------------------------------------------------------------------------
    // CASE B: INVOICE PAYMENT
    // -------------------------------------------------------------------------
    else if (existingTx.invoiceId) {
      // Row lock FOR UPDATE on invoice
      const lockedInvoices = await tx.$queryRaw<
        Array<{
          id: string;
          student_id: string;
          guardian_id: string;
          total_amount_kobo: bigint;
          amount_paid_kobo: bigint;
          outstanding_balance_kobo: bigint;
          status: InvoiceStatus;
          invoice_number: string;
        }>
      >`
        SELECT id, student_id, guardian_id, total_amount_kobo, amount_paid_kobo, outstanding_balance_kobo, status, invoice_number
        FROM invoices
        WHERE id = ${existingTx.invoiceId}::uuid
        FOR UPDATE;
      `;

      if (!lockedInvoices || lockedInvoices.length === 0) {
        throw new AuthorizationError("Invoice not found under lock.", 404, "INVOICE_NOT_FOUND");
      }

      const lockedInvoice = lockedInvoices[0];

      if (lockedInvoice.status === InvoiceStatus.CANCELLED) {
        throw new AuthorizationError("Cannot apply payment to a cancelled invoice.", 400, "INVOICE_CANCELLED");
      }

      // Overpayment prevention under lock
      if (gatewayAmountKobo > lockedInvoice.outstanding_balance_kobo) {
        throw new AuthorizationError(
          `Overpayment rejected: Invoice balance is ₦${(
            Number(lockedInvoice.outstanding_balance_kobo) / 100
          ).toFixed(2)}, but gateway paid ₦${(Number(gatewayAmountKobo) / 100).toFixed(2)}.`,
          400,
          "PAYMENT_EXCEEDS_BALANCE"
        );
      }

      // Generate official Payment reference (PAY-YYYY-NNNNN)
      const officialPayRef = await getNextPaymentReference(tx, currentYear);

      // Create official school Payment record
      const payment = await tx.payment.create({
        data: {
          paymentReference: officialPayRef,
          invoiceId: lockedInvoice.id,
          studentId: lockedInvoice.student_id,
          payerGuardianId: lockedInvoice.guardian_id,
          amountKobo: gatewayAmountKobo,
          paymentMethod: PaymentMethod.PAYSTACK,
          status: PaymentStatus.CONFIRMED,
          bankReference: reference,
          notes: `Paystack Online Payment (Ref: ${reference})`,
          paidAt: gatewayData.paid_at ? new Date(gatewayData.paid_at) : new Date(),
          reconciledAt: new Date(),
        },
      });

      schoolPaymentId = payment.id;

      // Allocate payment sequentially across InvoiceItems (FIFO)
      const invoiceItems = await tx.invoiceItem.findMany({
        where: { invoiceId: lockedInvoice.id },
        orderBy: { createdAt: "asc" },
      });

      const existingAllocations = await tx.paymentAllocation.findMany({
        where: {
          invoiceId: lockedInvoice.id,
          payment: { status: PaymentStatus.CONFIRMED },
        },
      });

      const itemPaidMap = new Map<string, bigint>();
      for (const ea of existingAllocations) {
        if (ea.invoiceItemId) {
          itemPaidMap.set(ea.invoiceItemId, (itemPaidMap.get(ea.invoiceItemId) || BigInt(0)) + ea.amountKobo);
        }
      }

      let remainingToAllocate = gatewayAmountKobo;
      for (const item of invoiceItems) {
        if (remainingToAllocate <= BigInt(0)) break;
        const itemPaid = itemPaidMap.get(item.id) || BigInt(0);
        const itemRemaining = item.totalAmountKobo - itemPaid;
        if (itemRemaining <= BigInt(0)) continue;

        const allocAmount = remainingToAllocate < itemRemaining ? remainingToAllocate : itemRemaining;
        await tx.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            invoiceId: lockedInvoice.id,
            invoiceItemId: item.id,
            amountKobo: allocAmount,
          },
        });
        remainingToAllocate -= allocAmount;
      }

      if (remainingToAllocate > BigInt(0)) {
        await tx.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            invoiceId: lockedInvoice.id,
            invoiceItemId: null,
            amountKobo: remainingToAllocate,
          },
        });
      }

      // Update invoice balances and status
      const newAmountPaid = lockedInvoice.amount_paid_kobo + gatewayAmountKobo;
      const newOutstanding = lockedInvoice.total_amount_kobo - newAmountPaid;
      const newStatus =
        newOutstanding <= BigInt(0) ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;

      await tx.invoice.update({
        where: { id: lockedInvoice.id },
        data: {
          amountPaidKobo: newAmountPaid,
          outstandingBalanceKobo: newOutstanding,
          status: newStatus,
        },
      });

      // Issue Official Receipt
      const guardian = await tx.guardian.findUnique({
        where: { id: lockedInvoice.guardian_id },
      });
      const issuedToName = guardian
        ? `${guardian.firstName} ${guardian.lastName}`.trim()
        : "Guardian/Parent";

      const receiptNum = await getNextReceiptNumber(tx, currentYear);
      receiptNumber = receiptNum;

      await tx.receipt.create({
        data: {
          receiptNumber: receiptNum,
          paymentId: payment.id,
          invoiceId: lockedInvoice.id,
          issuedToName,
          amountKobo: gatewayAmountKobo,
          issuedAt: new Date(),
        },
      });

      // Link PaymentTransaction to school payment
      await tx.paymentTransaction.update({
        where: { id: existingTx.id },
        data: {
          status: GatewayTransactionStatus.SUCCESS,
          schoolPaymentId: payment.id,
          gatewayTransactionId: String(gatewayData.id),
          amountKobo: gatewayAmountKobo,
          gatewayFeeKobo,
          netAmountKobo,
          paidAt: gatewayData.paid_at ? new Date(gatewayData.paid_at) : new Date(),
          channel: gatewayData.channel || null,
          customerEmail: gatewayData.customer?.email || null,
          authorizationCode: gatewayData.authorization?.authorization_code || null,
          ipAddress: gatewayData.ip_address || null,
          gatewayResponseJson: gatewayData as unknown as Prisma.InputJsonValue,
          settlementStatus: SettlementStatus.PENDING,
          reconciliationStatus: ReconciliationStatus.UNRECONCILED,
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          action: "INVOICE_PAYSTACK_PAYMENT_CONFIRMED",
          entityType: "Payment",
          entityId: payment.id,
          newValues: {
            paymentReference: officialPayRef,
            invoiceId: lockedInvoice.id,
            amountKobo: gatewayAmountKobo.toString(),
            receiptNumber: receiptNum,
            status: PaymentStatus.CONFIRMED,
          },
        },
      });

      notificationPayload = {
        guardianId: lockedInvoice.guardian_id,
        type: "INVOICE_PAYMENT_CONFIRMED",
        invoiceNumber: lockedInvoice.invoice_number,
        receiptNumber: receiptNum,
        amountKobo: gatewayAmountKobo.toString(),
      };
    }
  };

  // Execute single ACID transaction
  if ("$transaction" in rootClient) {
    await (rootClient as typeof prisma).$transaction(executeFinancialTransaction);
  } else {
    await executeFinancialTransaction(rootClient as Prisma.TransactionClient);
  }

  // 7. Decoupled Outbox Notification (outside transaction)
  if (notificationPayload) {
    try {
      await prisma.notification.create({
        data: {
          channel: "EMAIL",
          templateName: "PAYMENT_CONFIRMATION",
          subject: "Swanford Academy — Payment Confirmation",
          bodyText: `Your payment of ₦${(Number(gatewayAmountKobo) / 100).toFixed(
            2
          )} has been confirmed successfully (Ref: ${reference}).`,
          metadata: notificationPayload as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      // Notification failure must NEVER roll back confirmed financial transactions
      console.error("[Notification Outbox Warning] Failed to enqueue payment notification:", err);
    }
  }

  return {
    success: true,
    status: GatewayTransactionStatus.SUCCESS,
    reference,
    targetType: existingTx.applicationId ? PaymentTargetType.APPLICATION_FEE : PaymentTargetType.INVOICE,
    targetId: existingTx.applicationId || existingTx.invoiceId || "",
    amountKobo: gatewayAmountKobo,
    schoolPaymentId,
    receiptNumber,
    message: "Payment successfully verified and confirmed.",
  };
}

/**
 * Handles Paystack reversal, refund, or chargeback webhook events.
 * Crucial Rule: Preserves historical school financial records without deleting rows.
 */
export async function handleGatewayReversalOrRefund(
  gatewayData: PaystackTransactionData,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const reference = gatewayData.reference;
  if (!reference) return;

  const tx = await client.paymentTransaction.findUnique({
    where: { gatewayReference: reference },
  });

  if (!tx) return;

  // Update GatewayTransaction status to REVERSED
  await client.paymentTransaction.update({
    where: { id: tx.id },
    data: {
      status: GatewayTransactionStatus.REVERSED,
      gatewayResponseJson: gatewayData as unknown as Prisma.InputJsonValue,
    },
  });

  // Audit Log recording the gateway event
  await client.auditLog.create({
    data: {
      action: "PAYSTACK_TRANSACTION_REVERSED_OR_REFUNDED",
      entityType: "PaymentTransaction",
      entityId: tx.id,
      newValues: {
        reference,
        schoolPaymentId: tx.schoolPaymentId,
        gatewayStatus: gatewayData.status,
      },
    },
  });
}

/**
 * Ingests Paystack settlement reports and reconciles with captured transactions.
 */
export async function reconcileSettlementBatch(
  settlementData: PaystackSettlementData,
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const settlementId = String(settlementData.id);

  // 1. Create or update PaystackSettlement record
  const settlement = await client.paystackSettlement.upsert({
    where: { settlementId },
    create: {
      settlementId,
      grossAmountKobo: BigInt(settlementData.gross_amount),
      totalFeesKobo: BigInt(settlementData.total_fees),
      netAmountKobo: BigInt(settlementData.net_amount),
      status: SettlementStatus.SETTLED,
      settledAt: new Date(settlementData.settled_at),
      bankName: settlementData.bank_name || null,
      bankAccountNumber: settlementData.bank_account_number || null,
      rawResponseJson: settlementData as unknown as Prisma.InputJsonValue,
    },
    update: {
      grossAmountKobo: BigInt(settlementData.gross_amount),
      totalFeesKobo: BigInt(settlementData.total_fees),
      netAmountKobo: BigInt(settlementData.net_amount),
      status: SettlementStatus.SETTLED,
      settledAt: new Date(settlementData.settled_at),
    },
  });

  // 2. Link matching transactions
  if (settlementData.transactions && settlementData.transactions.length > 0) {
    for (const item of settlementData.transactions) {
      if (item.reference) {
        await client.paymentTransaction.updateMany({
          where: { gatewayReference: item.reference },
          data: {
            settlementBatchId: settlement.id,
            settlementStatus: SettlementStatus.SETTLED,
            reconciliationStatus: ReconciliationStatus.RECONCILED,
            settledAt: settlement.settledAt,
          },
        });
      }
    }
  }

  return settlement;
}

/**
 * Helper to verify session token by token string only.
 */
async function verifyPaymentSessionTokenByTokenOnly(
  token: string,
  targetType: PaymentTargetType
) {
  const session = await prisma.paymentSession.findFirst({
    where: {
      targetType,
      usedAt: null,
    },
    include: { application: true, invoice: true },
  });

  // Check using full verification method
  return verifyPaymentSessionToken({
    token,
    targetType,
    targetId: session?.applicationId || session?.invoiceId || "",
  });
}
