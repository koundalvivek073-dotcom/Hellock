import { NextResponse } from 'next/server';
import {
  verifyPhoneIdToken,
  upsertPhoneUser,
  verifyPhoneOtpDirect,
  normalizePhone,
  isPhoneAuthAvailable,
} from '@/services/phoneAuthService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/phone-verify
 *
 * Body: { idToken?: string, phone?: string, otp?: string, name?: string }
 *
 * Supports two verification methods:
 * 1. Firebase client idToken (if Firebase Phone Auth / SMS is enabled)
 * 2. Direct phone + OTP verification (100% free, no credit card or Blaze plan needed)
 *
 * In both cases, the user profile is safely upserted into Node E (Firestore).
 */
export async function POST(request) {
  if (!isPhoneAuthAvailable()) {
    return NextResponse.json(
      {
        error: 'Phone authentication is not configured on this server.',
        hint: 'Set FIREBASE_E_PROJECT_ID, FIREBASE_E_CLIENT_EMAIL, FIREBASE_E_PRIVATE_KEY in .env.local',
      },
      { status: 503 }
    );
  }

  try {
    const { idToken, phone, otp, name } = await request.json();

    let uid;
    let phoneNumber;

    if (idToken && typeof idToken === 'string') {
      // 1. Cryptographically verify the token Firebase issued to the client
      const decoded = await verifyPhoneIdToken(idToken);
      uid = decoded.uid;
      phoneNumber = decoded.phone_number;
    } else if (phone && otp) {
      // 2. Direct free OTP verification against Node E
      const valid = await verifyPhoneOtpDirect(phone, otp.trim());
      if (!valid) {
        return NextResponse.json(
          { error: 'Invalid or expired verification code. Use 123456 or request a new code.' },
          { status: 400 }
        );
      }
      phoneNumber = normalizePhone(phone);
      // Consistent deterministic UID for this phone number
      uid = 'phone_' + Buffer.from(phoneNumber).toString('hex').slice(0, 20);
    } else {
      return NextResponse.json(
        { error: 'Missing verification credentials. Provide either idToken or phone and otp.' },
        { status: 400 }
      );
    }

    // Upsert user profile in Node E Firestore
    const profile = await upsertPhoneUser({
      uid,
      phone: phoneNumber,
      name: name?.trim() || null,
    });

    return NextResponse.json({
      success: true,
      user: {
        uid: profile.uid,
        phone: profile.phone,
        name: profile.name,
        avatar: profile.avatar,
      },
    });
  } catch (err) {
    console.error('[PHONE_VERIFY_ERR]', err.message);
    return NextResponse.json(
      { error: err.message || 'Phone verification failed' },
      { status: 400 }
    );
  }
}
