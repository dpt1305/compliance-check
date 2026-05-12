import { NextRequest, NextResponse } from 'next/server';
import { sendDeadlineReminder } from '@/lib/services/notification';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json() as { message?: string };
  const message = body.message?.trim() || 'Compliance deadline reminder — please submit your documents.';
  try {
    await sendDeadlineReminder(message);
    return NextResponse.json({ message: 'Notification sent', mode: process.env.NOTIFICATION_MODE ?? 'teams' });
  } catch (err) {
    return NextResponse.json({ message: (err as Error).message }, { status: 500 });
  }
}
