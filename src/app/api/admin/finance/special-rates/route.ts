import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/request_auth';
import {
  listSpecialFeeRates,
  assignSpecialFeeRates,
  AssignSpecialRatesSchema,
} from '@/lib/finance/special_rate_service';
import { AuthorizationError } from '@/lib/auth/authorization';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const programmeId = searchParams.get('programmeId') || undefined;
    const academicSessionId = searchParams.get('sessionId') || undefined;
    const studentId = searchParams.get('studentId') || undefined;
    const isActiveParam = searchParams.get('isActive');
    const isActive = isActiveParam !== null ? isActiveParam === 'true' : undefined;

    const rates = await listSpecialFeeRates(actor, {
      programmeId,
      academicSessionId,
      studentId,
      isActive,
    });

    const serialized = rates.map((r) => ({
      ...r,
      customAmountKobo: r.customAmountKobo?.toString() || null,
      customAmountNaira: r.customAmountKobo ? Number(r.customAmountKobo) / 100 : null,
    }));

    return NextResponse.json(serialized);
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to retrieve special rates.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getAuthUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await request.json();
    const validated = AssignSpecialRatesSchema.parse(body);

    const created = await assignSpecialFeeRates(actor, validated);

    const serialized = created.map((r) => ({
      ...r,
      customAmountKobo: r.customAmountKobo?.toString() || null,
    }));

    return NextResponse.json({
      success: true,
      message: `Successfully assigned special fee rate to ${created.length} student(s).`,
      count: created.length,
      rates: serialized,
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Failed to assign special fee rates.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
