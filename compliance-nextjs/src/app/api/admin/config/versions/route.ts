import { NextRequest, NextResponse } from 'next/server';
import { isMongoEnabled } from '@/lib/db/mongo/connection';
import { getAllVersions, getVersion, revertToVersion, deleteVersion, cloneVersionToDraft } from '@/lib/services/project-config';

export async function GET() {
  try {
    const versions = await getAllVersions();
    return NextResponse.json(versions);
  } catch (err) {
    console.error('[api/config/versions GET]', err);
    return NextResponse.json({ message: 'Failed to load versions' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isMongoEnabled()) {
      return NextResponse.json({ message: 'Config requires MongoDB (MONGODB_URI must be set)' }, { status: 501 });
    }

    const body = await req.json();
    const { version, note } = body;

    if (!version || typeof version !== 'number') {
      return NextResponse.json({ message: 'Version number is required' }, { status: 400 });
    }

    const createdBy = req.headers.get('x-admin-user') || 'unknown';
    await revertToVersion(version, note, createdBy);

    return NextResponse.json({ message: `Reverted to v${version}` });
  } catch (err: any) {
    console.error('[api/config/versions POST]', err);
    return NextResponse.json({ message: err.message || 'Failed to revert version' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!isMongoEnabled()) {
      return NextResponse.json({ message: 'Config requires MongoDB (MONGODB_URI must be set)' }, { status: 501 });
    }

    const { searchParams } = new URL(req.url);
    const version = parseInt(searchParams.get('version') || '', 10);

    if (isNaN(version)) {
      return NextResponse.json({ message: 'Version number is required' }, { status: 400 });
    }

    const deleted = await deleteVersion(version);
    if (!deleted) {
      return NextResponse.json({ message: `Version ${version} not found` }, { status: 404 });
    }

    return NextResponse.json({ message: `Deleted v${version}` });
  } catch (err) {
    console.error('[api/config/versions DELETE]', err);
    return NextResponse.json({ message: 'Failed to delete version' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (!isMongoEnabled()) {
      return NextResponse.json({ message: 'Config requires MongoDB (MONGODB_URI must be set)' }, { status: 501 });
    }

    const body = await req.json();
    const { version } = body;

    if (!version || typeof version !== 'number') {
      return NextResponse.json({ message: 'Version number is required' }, { status: 400 });
    }

    const createdBy = req.headers.get('x-admin-user') || 'unknown';
    const newDraftVersion = await cloneVersionToDraft(version, createdBy);

    return NextResponse.json({ message: `Cloned v${version} to draft v${newDraftVersion}`, draftVersion: newDraftVersion });
  } catch (err: any) {
    console.error('[api/config/versions PATCH]', err);
    return NextResponse.json({ message: err.message || 'Failed to clone version' }, { status: 500 });
  }
}
