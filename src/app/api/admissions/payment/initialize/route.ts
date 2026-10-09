import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getConfiguredApplicationFormFeeKobo } from '@/lib/admissions/fee_calculation';
import { initializeTransaction } from '@/lib/paystack/client';
import { generatePaymentReference } from '@/lib/paystack/reference';
import { GatewayProvider, GatewayTransactionStatus, PaymentTargetType } from '@prisma/client';
import { checkRateLimit, getClientIp } from '@/lib/security/rate_limiter';
import { toUserFacingError } from '@/lib/ui/error_messages';
import { getEnv } from '@/lib/env';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const InitiateFormFeeSchema = z.object({
  guardianFullName: z.string().min(2, 'Parent / Guardian name is required').trim(),
  guardianEmail: z.string().email('Valid email address is required').toLowerCase().trim(),
  guardianPhone: z.string().min(8, 'Valid phone number is required').trim(),
  studentFullName: z.string().min(2, 'Pupil name is required').trim(),
  admissionCycleId: z.string().uuid('Admission cycle is required'),
  programmeId: z.string().uuid('Academic programme is required'),
  callbackUrl: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rateLimit = checkRateLimit(`admissions_init_fee:${ip}`, {
      windowMs: 60_000,
      maxRequests: 15,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment.' },
        { status: 429 }
      );
    }

    const body = await req.json();
    const validated = InitiateFormFeeSchema.parse(body);

    // 1. Authoritative dynamic form fee from PostgreSQL (Zero hardcoding!)
    const formFeeKobo = await getConfiguredApplicationFormFeeKobo(prisma);

    // 2. Verify admission cycle exists and is active
    const cycle = await prisma.admissionCycle.findUnique({
      where: { id: validated.admissionCycleId },
    });
    if (!cycle) {
      return NextResponse.json({ error: 'Selected admission cycle is not available.' }, { status: 400 });
    }

    // 3. Generate collision-resistant payment reference
    const reference = generatePaymentReference('APP', Date.now().toString());

    // 4. Determine callback destination
    const env = getEnv();
    const appUrl = env.APP_URL.replace(/\/$/, '');
    const callbackUrl = validated.callbackUrl?.trim() || `${appUrl}/admissions?payment_reference=${reference}`;

    // 5. Initialize with Paystack
    const gatewayResult = await initializeTransaction({
      email: validated.guardianEmail,
      amountKobo: formFeeKobo,
      reference,
      callbackUrl,
      metadata: {
        targetType: PaymentTargetType.APPLICATION_FEE,
        isPreApplicationFormFee: true,
        guardianFullName: validated.guardianFullName,
        guardianEmail: validated.guardianEmail,
        guardianPhone: validated.guardianPhone,
        studentFullName: validated.studentFullName,
        admissionCycleId: validated.admissionCycleId,
        programmeId: validated.programmeId,
      },
    });

    // 6. Record initialized transaction in database
    await prisma.paymentTransaction.create({
      data: {
        gatewayProvider: GatewayProvider.PAYSTACK,
        gatewayReference: reference,
        amountKobo: formFeeKobo,
        currency: 'NGN',
        status: GatewayTransactionStatus.INITIALIZED,
      },
    });

    return NextResponse.json({
      success: true,
      authorizationUrl: gatewayResult.authorizationUrl,
      accessCode: gatewayResult.accessCode,
      reference,
      formFeeKobo: formFeeKobo.toString(),
      formFeeNaira: Number(formFeeKobo) / 100,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Invalid input.' }, { status: 400 });
    }
    const userError = toUserFacingError(error);
    return NextResponse.json({ error: userError.message || userError.title }, { status: 500 });
  }
}
