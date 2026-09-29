import { NextResponse } from 'next/server';
import { lookupUserByPhone, isPhoneAuthAvailable, normalizePhone } from '@/services/phoneAuthService';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/phone-lookup?phone=+919876543210
 *
 * Looks up whether a phone number has a registered Hellock account in Node E.
 * Used by the ShareModal to validate a phone number before granting access.
 * Returns: { found: true, user: { phone, name, avatar } }
 *       or { found: false }
 */
export async function GET(request) {
  if (!isPhoneAuthAvailable()) {
    return NextResponse.json({ found: false, reason: 'phone-auth-not-configured' });
  }

  const { searchParams } = new URL(request.url);
  const rawPhone = searchParams.get('phone');

  if (!rawPhone) {
    return NextResponse.json({ error: 'Missing phone parameter' }, { status: 400 });
  }

  try {
    const phone = normalizePhone(rawPhone);
    const user = await lookupUserByPhone(phone);

    if (!user) {
      return NextResponse.json({ found: false });
    }

    return NextResponse.json({
      found: true,
      user: {
        phone: user.phone,
        name: user.name,
        avatar: user.avatar,
      },
    });
  } catch (err) {
    console.error('[PHONE_LOOKUP_ERR]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
