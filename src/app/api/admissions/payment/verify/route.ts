import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyTransaction } from '@/lib/paystack/client';
import { processVerifiedTransaction } from '@/lib/paystack/service';
import { GatewayTransactionStatus } from '@prisma/client';
import { checkRateLimit, getClientIp } from '@/lib/security/rate_limiter';
import { toUserFacingError } from '@/lib/ui/error_messages';
import { getConfiguredApplicationFormFeeKobo } from '@/lib/admissions/fee_calculation';

export const dynamic = 'force-dynamic';

/**
 * Public Admission Form Fee Verification Endpoint
 * POST /api/admissions/payment/verify
 *
 * Security Controls:
 * 1. IP rate limiting (mitigates brute-force / verification amplification).
 * 2. Strict format validation on payment reference.
 * 3. Authoritative local pre-check ensuring reference exists and was initialized for application form fee.
 * 4. Replay attack defense: Rejects references already claimed by an application or assigned to an invoice.
 * 5. Minimum fee amount validation: Server-enforces configured form fee (rejects underpaid or partial payments).
 * 6. Currency validation: Strictly enforces NGN currency.
 * 7. Unified processing: Executes atomic state transition via processVerifiedTransaction.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rateLimit = checkRateLimit(`admissions_verify_fee:${ip}`, {
      windowMs: 60_000,
      maxRequests: 20,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many verification attempts. Please wait a moment.' },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { reference } = body;

    if (!reference || typeof reference !== 'string') {
      return NextResponse.json({ error: 'Payment reference is required.' }, { status: 400 });
    }

    const cleanRef = reference.trim();
    if (!/^[a-zA-Z0-9_\-\.]{5,100}$/.test(cleanRef)) {
      return NextResponse.json({ error: 'Invalid payment reference format.' }, { status: 400 });
    }

    // 1. Authoritative local pre-check
    const existingTx = await prisma.paymentTransaction.findUnique({
      where: { gatewayReference: cleanRef },
    });

    if (!existingTx) {
      return NextResponse.json(
        { error: 'Payment reference not found or unauthorized.' },
        { status: 404 }
      );
    }

    // Replay check: cannot verify a reference already claimed by another application
    if (existingTx.applicationId) {
      return NextResponse.json(
        { error: 'This payment reference has already been claimed by an admission application.' },
        { status: 400 }
      );
    }

    // Cross-purpose check: cannot verify an invoice payment for admission application
    if (existingTx.invoiceId) {
      return NextResponse.json(
        { error: 'Invalid payment target: reference belongs to a student fee invoice.' },
        { status: 400 }
      );
    }

    const formFeeKobo = await getConfiguredApplicationFormFeeKobo(prisma);

    // 2. Fast-path: If local transaction is already confirmed as SUCCESS
    if (existingTx.status === GatewayTransactionStatus.SUCCESS) {
      if (existingTx.currency !== 'NGN') {
        return NextResponse.json({ error: 'Invalid payment currency. Expected NGN.' }, { status: 400 });
      }
      if (existingTx.amountKobo < formFeeKobo) {
        return NextResponse.json(
          { error: `Payment amount is less than the required form fee of ₦${(Number(formFeeKobo) / 100).toLocaleString()}.` },
          { status: 400 }
        );
      }

      const rawMetadata = (existingTx.gatewayResponseJson as any)?.metadata || {};
      return NextResponse.json({
        success: true,
        verified: true,
        reference: cleanRef,
        amountKobo: existingTx.amountKobo.toString(),
        amountNaira: Number(existingTx.amountKobo) / 100,
        payerEmail: existingTx.customerEmail || '',
        metadata: {
          guardianFullName: rawMetadata.guardianFullName || '',
          guardianEmail: rawMetadata.guardianEmail || existingTx.customerEmail || '',
          guardianPhone: rawMetadata.guardianPhone || '',
          studentFullName: rawMetadata.studentFullName || '',
          admissionCycleId: rawMetadata.admissionCycleId || '',
          programmeId: rawMetadata.programmeId || '',
        },
      });
    }

    // 3. Query Paystack directly for pending transaction
    let gatewayTx;
    try {
      gatewayTx = await verifyTransaction(cleanRef);
    } catch {
      return NextResponse.json(
        { error: 'Could not verify payment reference with gateway.' },
        { status: 400 }
      );
    }

    if (!gatewayTx.status || gatewayTx.data.status?.toLowerCase() !== 'success') {
      return NextResponse.json(
        {
          error: `Payment is not completed. Current gateway status is '${gatewayTx.data?.status || 'unverified'}'.`,
          status: gatewayTx.data?.status,
        },
        { status: 400 }
      );
    }

    // 4. Validate Gateway Currency
    if (gatewayTx.data.currency && gatewayTx.data.currency.toUpperCase() !== 'NGN') {
      return NextResponse.json(
        { error: `Currency mismatch: Expected NGN, but gateway returned ${gatewayTx.data.currency}.` },
        { status: 400 }
      );
    }

    // 5. Validate Gateway Amount against configured Application Form Fee
    const gatewayAmountKobo = BigInt(gatewayTx.data.amount || 0);
    if (gatewayAmountKobo < formFeeKobo) {
      return NextResponse.json(
        {
          error: `Payment amount (₦${(Number(gatewayAmountKobo) / 100).toLocaleString()}) is less than the required admission form fee (₦${(Number(formFeeKobo) / 100).toLocaleString()}).`,
        },
        { status: 400 }
      );
    }

    // 6. Process transaction atomically via the unified engine
    await processVerifiedTransaction(cleanRef, gatewayTx.data);

    const metadata = (gatewayTx.data.metadata || {}) as Record<string, any>;

    return NextResponse.json({
      success: true,
      verified: true,
      reference: cleanRef,
      amountKobo: gatewayAmountKobo.toString(),
      amountNaira: Number(gatewayAmountKobo) / 100,
      payerEmail: gatewayTx.data.customer?.email || '',
      metadata: {
        guardianFullName: metadata.guardianFullName || '',
        guardianEmail: metadata.guardianEmail || gatewayTx.data.customer?.email || '',
        guardianPhone: metadata.guardianPhone || '',
        studentFullName: metadata.studentFullName || '',
        admissionCycleId: metadata.admissionCycleId || '',
        programmeId: metadata.programmeId || '',
      },
    });
  } catch (error: unknown) {
    const userError = toUserFacingError(error);
    return NextResponse.json(
      { error: userError.message || userError.title },
      { status: 500 }
    );
  }
}
