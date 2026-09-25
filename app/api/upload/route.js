import { NextResponse } from 'next/server';
import { uploadFile } from '@/services/uploadService';
import { requireUserOrDemo } from '@/services/authService';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const user = await requireUserOrDemo(request);
    const contentType = request.headers.get('content-type') || '';
    let filename = 'file.bin';
    let mimeType = 'application/octet-stream';
    let buffer;
    let fileId;
    let customOwner = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file');

      if (!file) {
        return NextResponse.json({ error: 'No file provided in form data' }, { status: 400 });
      }

      filename = file.name || filename;
      mimeType = file.type || mimeType;
      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      fileId = formData.get('fileId') || undefined;
      customOwner = formData.get('owner') || null;
    } else {
      // JSON payload (useful for programmatic testing / demo scripts)
      const body = await request.json();
      if (!body.content) {
        return NextResponse.json({ error: 'Missing content in request body' }, { status: 400 });
      }

      filename = body.filename || 'demo.txt';
      mimeType = body.mimeType || 'text/plain';
      fileId = body.fileId || undefined;
      customOwner = body.owner || null;

      if (body.encoding === 'base64') {
        buffer = Buffer.from(body.content, 'base64');
      } else {
        buffer = Buffer.from(body.content, 'utf-8');
      }
    }

    const effectiveOwner = customOwner || user.email;
    const effectiveOwnerName = user.name || effectiveOwner.split('@')[0];

    const result = await uploadFile({
      filename,
      buffer,
      mimeType,
      fileId,
      owner: effectiveOwner,
      ownerName: effectiveOwnerName
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error('[API_UPLOAD_ERR]', err);
    return NextResponse.json({
      error: err.message || 'Upload failed',
      details: err.stack
    }, { status: 500 });
  }
}
