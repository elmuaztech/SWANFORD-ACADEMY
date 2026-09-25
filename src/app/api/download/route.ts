import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  const filePath = path.join(process.cwd(), 'public', 'SWANFORD_ACADEMY.zip');

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'Archive not found.' }, { status: 404 });
  }

  const fileStat = fs.statSync(filePath);
  const fileBuffer = fs.readFileSync(filePath);

  return new Response(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="SWANFORD_ACADEMY.zip"',
      'Content-Length': fileStat.size.toString(),
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
