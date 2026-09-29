import { NextResponse } from 'next/server';
import { grantAccess, revokeAccess, setPublicAccess } from '@/services/shareService';
import { requireUserOrDemo } from '@/services/authService';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const user = await requireUserOrDemo(request);
    const body = await request.json();
    const { fileId, targetEmail, action = 'grant', isPublic, owner: customRequester } = body;
    const requesterEmail = customRequester || user.email;

    if (!fileId) {
      return NextResponse.json(
        { error: 'Missing required parameter: fileId' },
        { status: 400 }
      );
    }

    let updatedFile;
    let message = '';

    if (action === 'setPublic') {
      updatedFile = await setPublicAccess(fileId, requesterEmail, Boolean(isPublic));
      message = isPublic
        ? 'File is now public: Anyone with the link can view and download'
        : 'File is now restricted: Only authorized accounts can view';
    } else if (action === 'revoke') {
      if (!targetEmail) {
        return NextResponse.json({ error: 'Missing targetEmail for revoke' }, { status: 400 });
      }
      updatedFile = await revokeAccess(fileId, requesterEmail, targetEmail);
      message = `Revoked access for ${targetEmail}`;
    } else {
      if (!targetEmail) {
        return NextResponse.json({ error: 'Missing targetEmail to grant access' }, { status: 400 });
      }
      updatedFile = await grantAccess(fileId, requesterEmail, targetEmail);
      message = `Access granted to ${targetEmail}`;
    }

    return NextResponse.json({
      success: true,
      file: updatedFile,
      message
    });
  } catch (err) {
    console.error('[API_SHARE_ERR]', err);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
