import { NextResponse } from 'next/server';
import { generatePhoneOtp, normalizePhone, isPhoneAuthAvailable } from '@/services/phoneAuthService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/phone-send-otp
 * Body: { phone: string }
 *
 * Sends/generates an OTP for phone authentication.
 * If Firebase SMS is restricted (due to Blaze plan requirements),
 * this provides zero-cost immediate OTP verification and registers
 * the user in Node E (Firestore).
 */
export async function POST(request) {
  try {
    const { phone } = await request.json();
    if (!phone || typeof phone !== 'string') {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    const normalized = normalizePhone(phone);
    if (normalized.length < 10) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    }

    const otp = await generatePhoneOtp(normalized);

    return NextResponse.json({
      success: true,
      phone: normalized,
      testOtp: otp, // Returned for dev/testing so users don't need paid SMS
      message: `OTP generated for ${normalized}. (Testing PIN: ${otp})`,
    });
  } catch (err) {
    console.error('[PHONE_SEND_OTP_ERR]', err);
    return NextResponse.json(
      { error: err.message || 'Failed to generate OTP' },
      { status: 500 }
    );
  }
}
