import { NextResponse } from 'next/server';
import { getFilesForUser } from '@/services/shareService';
import { getAllFilesMetadata } from '@/services/metadataService';
import { requireUserOrDemo } from '@/services/authService';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const user = await requireUserOrDemo(request);
    const { searchParams } = new URL(request.url);
    const showAll = searchParams.get('all') === 'true';
    const effectiveUserEmail = searchParams.get('user') || user.email;

    let files = [];
    if (showAll) {
      files = await getAllFilesMetadata();
    } else {
      files = await getFilesForUser(effectiveUserEmail);
    }

    // Decorate each file with ownership and access flags for user-facing UI
    const decoratedFiles = files.map((file) => {
      const isOwner = (file.owner || '').toLowerCase() === user.email.toLowerCase();
      return {
        ...file,
        isOwner,
        sharedBy: isOwner ? null : (file.ownerName || file.owner),
        authorizedCount: (file.authorizedAccounts || []).length
      };
    });

    return NextResponse.json({
      user: { email: user.email, name: user.name },
      files: decoratedFiles
    });
  } catch (err) {
    console.error('[API_FILES_ERR]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
