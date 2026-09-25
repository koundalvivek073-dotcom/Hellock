import { NextResponse } from 'next/server';
import { grantAccess, revokeAccess } from '@/services/shareService';
import { requireUserOrDemo } from '@/services/authService';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const user = await requireUserOrDemo(request);
    const body = await request.json();
    const { fileId, targetEmail, action = 'grant', owner: customRequester } = body;
    const requesterEmail = customRequester || user.email;

    if (!fileId || !targetEmail) {
      return NextResponse.json(
        { error: 'Missing required parameters: fileId and targetEmail' },
        { status: 400 }
      );
    }

    let updatedFile;
    if (action === 'revoke') {
      updatedFile = await revokeAccess(fileId, requesterEmail, targetEmail);
    } else {
      updatedFile = await grantAccess(fileId, requesterEmail, targetEmail);
    }

    return NextResponse.json({
      success: true,
      file: updatedFile,
      message: action === 'revoke'
        ? `Revoked access for ${targetEmail}`
        : `Access granted to ${targetEmail}`
    });
  } catch (err) {
    console.error('[API_SHARE_ERR]', err);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
