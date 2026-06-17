import { NextRequest, NextResponse } from 'next/server';
import { isMongoEnabled } from '@/lib/db/mongo/connection';
import { getActiveConfig, getDraftConfig, updateDraft, createDraft, publishDraft, getVersion } from '@/lib/services/project-config';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const isDraft = searchParams.get('draft') === 'true';
    const versionParam = searchParams.get('version');

    if (versionParam) {
      const version = parseInt(versionParam, 10);
      if (isNaN(version)) {
        return NextResponse.json({ message: 'Invalid version number' }, { status: 400 });
      }
      const config = await getVersion(version);
      if (!config) {
        return NextResponse.json({ message: `Version ${version} not found` }, { status: 404 });
      }
      return NextResponse.json(config);
    }

    if (isDraft) {
      const draft = await getDraftConfig();
      if (!draft) {
        return NextResponse.json({ message: 'No draft found' }, { status: 404 });
      }
      return NextResponse.json(draft);
    }

    const config = await getActiveConfig();
    if (!config) {
      return NextResponse.json({ message: 'No published config found' }, { status: 404 });
    }
    return NextResponse.json(config);
  } catch (err) {
    console.error('[api/config GET]', err);
    return NextResponse.json({ message: 'Failed to load config' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    if (!isMongoEnabled()) {
      return NextResponse.json({ message: 'Config requires MongoDB (MONGODB_URI must be set)' }, { status: 501 });
    }

    const body = await req.json();
    const { name, description, formFields, submissionTypes, outputColumns } = body;

    if (!name || !formFields || !submissionTypes || !outputColumns) {
      return NextResponse.json(
        { message: 'Missing required fields: name, formFields, submissionTypes, outputColumns' },
        { status: 400 },
      );
    }

    const config = {
      name,
      description: description || '',
      formFields,
      submissionTypes,
      outputColumns,
    };

    const createdBy = req.headers.get('x-admin-user') || 'unknown';

    try {
      await updateDraft(config, createdBy);
    } catch (err: any) {
      // If no draft exists, create one first
      if (err.message?.includes('No draft')) {
        await createDraft(createdBy);
        await updateDraft(config, createdBy);
      } else {
        throw err;
      }
    }

    return NextResponse.json({ message: 'Draft saved successfully' });
  } catch (err) {
    console.error('[api/config PUT]', err);
    return NextResponse.json({ message: 'Failed to save draft' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isMongoEnabled()) {
      return NextResponse.json({ message: 'Config requires MongoDB (MONGODB_URI must be set)' }, { status: 501 });
    }

    const body = await req.json();
    const { note } = body;

    const createdBy = req.headers.get('x-admin-user') || 'unknown';
    await publishDraft(note, createdBy);

    return NextResponse.json({ message: 'Config published successfully' });
  } catch (err: any) {
    console.error('[api/config POST]', err);
    return NextResponse.json({ message: err.message || 'Failed to publish config' }, { status: 500 });
  }
}
