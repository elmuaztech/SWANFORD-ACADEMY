import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyTransaction } from '@/lib/paystack/client';
import { GatewayTransactionStatus, PaymentTargetType } from '@prisma/client';
import { checkRateLimit, getClientIp } from '@/lib/security/rate_limiter';
import { toUserFacingError } from '@/lib/ui/error_messages';
import { getConfiguredApplicationFormFeeKobo } from '@/lib/admissions/fee_calculation';

export const dynamic = 'force-dynamic';

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

    const body = await req.json();
    const { reference } = body;

    if (!reference || typeof reference !== 'string') {
      return NextResponse.json({ error: 'Payment reference is required.' }, { status: 400 });
    }

    const cleanRef = reference.trim();

    // 1. Check local transaction state
    const existingTx = await prisma.paymentTransaction.findUnique({
      where: { gatewayReference: cleanRef },
    });

    // 2. Query Paystack directly
    let gatewayTx;
    try {
      gatewayTx = await verifyTransaction(cleanRef);
    } catch {
      // If external call fails, check if local transaction is already marked successful
      if (existingTx && existingTx.status === GatewayTransactionStatus.SUCCESS) {
        const formFeeKobo = await getConfiguredApplicationFormFeeKobo(prisma);
        return NextResponse.json({
          success: true,
          verified: true,
          reference: cleanRef,
          amountKobo: existingTx.amountKobo.toString(),
          amountNaira: Number(existingTx.amountKobo) / 100,
        });
      }
      return NextResponse.json({ error: 'Could not verify payment reference with gateway.' }, { status: 400 });
    }

    if (!gatewayTx.status || gatewayTx.data.status?.toLowerCase() !== 'success') {
      return NextResponse.json({
        error: `Payment is not completed. Current gateway status is '${gatewayTx.data?.status || 'unverified'}'.`,
        status: gatewayTx.data?.status,
      }, { status: 400 });
    }

    // Update transaction to SUCCESS
    if (existingTx) {
      await prisma.paymentTransaction.update({
        where: { id: existingTx.id },
        data: {
          status: GatewayTransactionStatus.SUCCESS,
          paidAt: new Date(),
        },
      });
    }

    const metadata = (gatewayTx.data.metadata || {}) as Record<string, any>;
    const amountKobo = BigInt(gatewayTx.data.amount || 0);

    return NextResponse.json({
      success: true,
      verified: true,
      reference: cleanRef,
      amountKobo: amountKobo.toString(),
      amountNaira: Number(amountKobo) / 100,
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
    return NextResponse.json({ error: userError.message || userError.title }, { status: 500 });
  }
}
